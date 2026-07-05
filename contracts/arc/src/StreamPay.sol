// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title StreamPay — real-USDC pay-per-second streaming on Arc
/// @notice On Arc, USDC is the *native* token (gas). This contract streams REAL
///         USDC by the second: a payer opens a stream funded with native USDC at
///         a fixed rate, the payee withdraws whatever has accrued at any moment,
///         and the payer can pause, resume, or stop (reclaiming the unspent tail).
///         This is the "Streaming & Continuous Payments" primitive — continuous
///         authorization of a *rate*, not a signature per payment — with the
///         actual value settled in native USDC. No mock token, no representation.
///
///         This is the base nanopayment rail. Shade's ZK privacy layer (vouchers
///         + shielded settlement) composes on top of it; here the money is real
///         and the amounts are visible on-chain, which is what the streaming
///         use case demands.
contract StreamPay {
    struct Stream {
        address payer;         // funds the stream, can pause/resume/stop
        address payee;         // receives the streamed USDC
        uint256 ratePerSecond; // native USDC (18-dec on Arc) accrued per second
        uint256 deposited;     // total USDC funded into the stream (the cap)
        uint256 accrued;       // USDC owed to payee, advanced to `lastTick`
        uint256 withdrawn;     // USDC already paid out to payee
        uint64  lastTick;      // timestamp `accrued` was last advanced from
        bool    active;        // true while streaming; false when paused/stopped
        bool    closed;        // true once stopped — no further accrual ever
    }

    mapping(bytes32 => Stream) public streams;

    event Opened(bytes32 indexed id, address indexed payer, address indexed payee, uint256 ratePerSecond, uint256 deposited);
    event Withdrawn(bytes32 indexed id, uint256 amount, uint256 totalPaid);
    event Paused(bytes32 indexed id, uint256 accrued);
    event Resumed(bytes32 indexed id);
    event Stopped(bytes32 indexed id, uint256 paidToPayee, uint256 refundToPayer);

    error StreamExists();
    error NoStream();
    error BadArgs();
    error NotPayer();
    error NotPayee();
    error NotActive();
    error NotPaused();
    error AlreadyClosed();
    error NothingToWithdraw();
    error TransferFailed();

    /// @notice Open a stream, funding it with native USDC (`msg.value` = the cap).
    /// @param id           caller-chosen unique stream id
    /// @param payee        who receives the streamed USDC
    /// @param ratePerSecond USDC (18-dec) to accrue to the payee each second
    function open(bytes32 id, address payee, uint256 ratePerSecond) external payable {
        if (streams[id].payer != address(0)) revert StreamExists();
        if (msg.value == 0 || ratePerSecond == 0 || payee == address(0)) revert BadArgs();
        streams[id] = Stream({
            payer: msg.sender,
            payee: payee,
            ratePerSecond: ratePerSecond,
            deposited: msg.value,
            accrued: 0,
            withdrawn: 0,
            lastTick: uint64(block.timestamp),
            active: true,
            closed: false
        });
        emit Opened(id, msg.sender, payee, ratePerSecond, msg.value);
    }

    /// @notice USDC owed to the payee so far (accrued + live accrual while active),
    ///         capped at the deposit. This is the real-time meter.
    function earned(bytes32 id) public view returns (uint256) {
        Stream storage s = streams[id];
        uint256 total = s.accrued;
        if (s.active && !s.closed) {
            total += s.ratePerSecond * (block.timestamp - s.lastTick);
        }
        if (total > s.deposited) total = s.deposited;
        return total;
    }

    /// @notice USDC the payee can withdraw right now.
    function withdrawable(bytes32 id) external view returns (uint256) {
        return earned(id) - streams[id].withdrawn;
    }

    function _advance(Stream storage s) internal {
        if (s.active && !s.closed) {
            uint256 total = s.accrued + s.ratePerSecond * (block.timestamp - s.lastTick);
            if (total > s.deposited) total = s.deposited;
            s.accrued = total;
        }
        s.lastTick = uint64(block.timestamp);
    }

    /// @notice Payee pulls whatever USDC has accrued but not yet been paid.
    function withdraw(bytes32 id) external {
        Stream storage s = streams[id];
        if (s.payee == address(0)) revert NoStream();
        if (msg.sender != s.payee) revert NotPayee();
        _advance(s);
        uint256 amount = s.accrued - s.withdrawn;
        if (amount == 0) revert NothingToWithdraw();
        s.withdrawn += amount;
        (bool ok, ) = s.payee.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(id, amount, s.withdrawn);
    }

    /// @notice Payer pauses the stream — accrual freezes, no USDC accrues while paused.
    function pause(bytes32 id) external {
        Stream storage s = streams[id];
        if (msg.sender != s.payer) revert NotPayer();
        if (!s.active || s.closed) revert NotActive();
        _advance(s);
        s.active = false;
        emit Paused(id, s.accrued);
    }

    /// @notice Payer resumes a paused stream — accrual restarts from now.
    function resume(bytes32 id) external {
        Stream storage s = streams[id];
        if (msg.sender != s.payer) revert NotPayer();
        if (s.closed || s.active) revert NotPaused();
        s.active = true;
        s.lastTick = uint64(block.timestamp);
        emit Resumed(id);
    }

    /// @notice Payer stops the stream: the payee is paid everything accrued so far,
    ///         and the unspent remainder is refunded to the payer. Terminal.
    function stop(bytes32 id) external {
        Stream storage s = streams[id];
        if (msg.sender != s.payer) revert NotPayer();
        if (s.closed) revert AlreadyClosed();
        _advance(s);
        s.closed = true;
        s.active = false;
        uint256 toPayee = s.accrued - s.withdrawn;
        uint256 refund = s.deposited - s.accrued;
        s.withdrawn = s.accrued;
        if (toPayee > 0) {
            (bool a, ) = s.payee.call{value: toPayee}("");
            if (!a) revert TransferFailed();
        }
        if (refund > 0) {
            (bool b, ) = s.payer.call{value: refund}("");
            if (!b) revert TransferFailed();
        }
        emit Stopped(id, toPayee, refund);
    }
}
