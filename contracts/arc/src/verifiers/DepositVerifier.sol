// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract DepositVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 5141173850987760717263358351443372251542330505275765966189922320550726366508;
    uint256 constant alphay  = 10205452431040597704376143033029034885577447791054380814279242597598211664018;
    uint256 constant betax1  = 13542136288405189413771353477767233123303619879904347473523483593992957341352;
    uint256 constant betax2  = 3336273949599465742578717466444936757885753961312442313382625203019174922408;
    uint256 constant betay1  = 16832926990077782578542790707771976975154561213505298965831500803767864781849;
    uint256 constant betay2  = 16094957125214348601679085324326641899422382584833355885406073096264881440752;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 12599857379517512478445603412764121041984228075771497593287716170335433683702;
    uint256 constant deltax2 = 7912208710313447447762395792098481825752520616755888860068004689933335666613;
    uint256 constant deltay1 = 11502426145685875357967720478366491326865907869902181704031346886834786027007;
    uint256 constant deltay2 = 21679208693936337484429571887537508926366191105267550375038502782696042114705;

    
    uint256 constant IC0x = 2586351418116815184587092998448328065357578981774747111415183091453831948944;
    uint256 constant IC0y = 2676873309814081605977523789083425382676224644708533093541944617428226106553;
    
    uint256 constant IC1x = 8137262322095448509370004298320452604050073962943997603083066570873615294134;
    uint256 constant IC1y = 573905638667976021836427670747695588584895938675925448013597144831372908089;
    
    uint256 constant IC2x = 18306318918604927224591703359104801478619452497899829795875384960378607691869;
    uint256 constant IC2y = 14198513563382394694750259921930413067757356824959860811837412138333188019646;
    
    uint256 constant IC3x = 9191467745582697156037459236613064744665996251956848704161134118752571605563;
    uint256 constant IC3y = 8214101330672402148661234154572214386750290743153764900368574848907792523191;
    
    uint256 constant IC4x = 15153570953835755062148119290436965443556591860884073693929187214708601260189;
    uint256 constant IC4y = 19839565268889936111807167682747096436140441220798220780300466191339449081025;
    
    uint256 constant IC5x = 8793050572781035989426089596178246469608767133566141159902495049234481019822;
    uint256 constant IC5y = 10439786322355001375825789888136218385153280169094181947213110745986633258608;
    
    uint256 constant IC6x = 10837863736635753052083984509907045003270546655501823160506740892149739876655;
    uint256 constant IC6y = 15589154639741382782219704892016754778506009921064596630604249046438154037021;
    
    uint256 constant IC7x = 167223422748255691911384461763009379747274918171075039712690923415297324760;
    uint256 constant IC7y = 14857369777798607226288064986471382257651309025575411839043798246761599783804;
    
    uint256 constant IC8x = 2732036223193233344484006415256023286015459543400325981788162587478482360374;
    uint256 constant IC8y = 9050202226975816000872195513584860636886492689344502982901999491570991833706;
    
    uint256 constant IC9x = 18997004621083157529818295545749783656184607164762939749731190630271309820770;
    uint256 constant IC9y = 1932503626077887023050826885310852396087790116829261038154603193182312700422;
    
    uint256 constant IC10x = 409473197361994993870803790210754751052541414044964266688711848594797067182;
    uint256 constant IC10y = 11202396024421133218294405500544343093018625661359016769437061647445759892164;
    
    uint256 constant IC11x = 10178653711903388965274651757308467043965248354048952806317358040468435178319;
    uint256 constant IC11y = 8541599484891466481482771632036141768057720930337769149886497747133560653047;
    
    uint256 constant IC12x = 1000786251260778000537667529611258810855831398904241916836344327472259570071;
    uint256 constant IC12y = 18261775111007470688124599934827921776698864148532875954287553814551795221822;
    
    uint256 constant IC13x = 604102120580807255446180794418616252948816276026080467243260244947251365096;
    uint256 constant IC13y = 17968236860175807872383633375053987648805397575790081889475136017578099155759;
    
    uint256 constant IC14x = 17481830479730766328100213443117035211341511583263356810434111574727157597418;
    uint256 constant IC14y = 8628042681611838764015896932047707929799000810450681407346309296857023267643;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[14] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
