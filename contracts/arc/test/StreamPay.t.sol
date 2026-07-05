// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StreamPay} from "../src/StreamPay.sol";

contract StreamPayTest is Test {
    StreamPay pay;
    address payer = address(0xA11CE);
    address payee = address(0xB0B);
    bytes32 constant ID = bytes32(uint256(1));

    // rate: 0.0001 USDC/sec (18-dec native) — a true nanopayment rate
    uint256 constant RATE = 1e14;
    uint256 constant CAP = 1e16; // 0.01 USDC, funds 100s at RATE

    function setUp() public {
        pay = new StreamPay();
        vm.deal(payer, 1 ether);
    }

    function _open() internal {
        vm.prank(payer);
        pay.open{value: CAP}(ID, payee, RATE);
    }

    function testOpenLocksDeposit() public {
        _open();
        (address p, address e, uint256 rate, uint256 dep,,,,,) = pay.streams(ID);
        assertEq(p, payer);
        assertEq(e, payee);
        assertEq(rate, RATE);
        assertEq(dep, CAP);
        assertEq(address(pay).balance, CAP);
    }

    function testAccruesPerSecond() public {
        _open();
        assertEq(pay.earned(ID), 0);
        skip(10);
        assertEq(pay.earned(ID), 10 * RATE); // exactly 10 seconds of USDC
    }

    function testAccrualCapsAtDeposit() public {
        _open();
        skip(10_000); // way past CAP/RATE = 100s
        assertEq(pay.earned(ID), CAP); // never exceeds the deposit
    }

    function testPayeeWithdrawsAccruedUsdc() public {
        _open();
        skip(30);
        uint256 before = payee.balance;
        vm.prank(payee);
        pay.withdraw(ID);
        assertEq(payee.balance - before, 30 * RATE); // real USDC moved
        assertEq(pay.withdrawable(ID), 0);
    }

    function testPauseFreezesAccrual() public {
        _open();
        skip(10);
        vm.prank(payer);
        pay.pause(ID);
        uint256 atPause = pay.earned(ID);
        skip(1000); // time passes while paused
        assertEq(pay.earned(ID), atPause); // no accrual while paused
    }

    function testResumeContinuesAccrual() public {
        _open();
        skip(10);
        vm.prank(payer);
        pay.pause(ID);
        skip(1000);
        vm.prank(payer);
        pay.resume(ID);
        skip(5);
        assertEq(pay.earned(ID), 15 * RATE); // 10 before + 5 after, none while paused
    }

    function testStopPaysPayeeAndRefundsPayer() public {
        _open();
        skip(40);
        uint256 payeeBefore = payee.balance;
        uint256 payerBefore = payer.balance;
        vm.prank(payer);
        pay.stop(ID);
        assertEq(payee.balance - payeeBefore, 40 * RATE);        // payee gets 40s
        assertEq(payer.balance - payerBefore, CAP - 40 * RATE);  // payer refunded the tail
        assertEq(address(pay).balance, 0);                       // fully drained
    }

    function testStopAfterPartialWithdraw() public {
        _open();
        skip(20);
        vm.prank(payee);
        pay.withdraw(ID); // pulls 20s
        skip(20);
        uint256 payeeBefore = payee.balance;
        vm.prank(payer);
        pay.stop(ID);
        assertEq(payee.balance - payeeBefore, 20 * RATE);   // only the remaining 20s
        assertEq(payee.balance, 40 * RATE);                 // 40s total across both
    }

    function testValueConservation() public {
        _open();
        skip(55);
        vm.prank(payee);
        pay.withdraw(ID);
        vm.prank(payer);
        pay.stop(ID);
        // everything paid out equals exactly what was deposited
        assertEq(payee.balance + (payer.balance - (1 ether - CAP)), CAP);
    }

    function testOnlyPayeeWithdraws() public {
        _open();
        skip(10);
        vm.prank(payer);
        vm.expectRevert(StreamPay.NotPayee.selector);
        pay.withdraw(ID);
    }

    function testOnlyPayerControls() public {
        _open();
        vm.prank(payee);
        vm.expectRevert(StreamPay.NotPayer.selector);
        pay.pause(ID);
    }

    function testCannotStopTwice() public {
        _open();
        vm.prank(payer);
        pay.stop(ID);
        vm.prank(payer);
        vm.expectRevert(StreamPay.AlreadyClosed.selector);
        pay.stop(ID);
    }

    function testCannotReuseId() public {
        _open();
        vm.prank(payer);
        vm.expectRevert(StreamPay.StreamExists.selector);
        pay.open{value: CAP}(ID, payee, RATE);
    }

    function testRejectsZeroDeposit() public {
        vm.prank(payer);
        vm.expectRevert(StreamPay.BadArgs.selector);
        pay.open{value: 0}(ID, payee, RATE);
    }
}
