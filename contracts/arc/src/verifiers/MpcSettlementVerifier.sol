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

contract MpcSettlementVerifier {
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

    
    uint256 constant IC0x = 6701131279526051601488643495718613923009432176765753388410727346469310169195;
    uint256 constant IC0y = 10403015744930217646593272647988123869631607367611284896297142329218926122526;
    
    uint256 constant IC1x = 15904204148427182514355353055964325925794045546435320707431089260506846694250;
    uint256 constant IC1y = 6967913156072513334342492578901730626161773808683721533959058013995212946418;
    
    uint256 constant IC2x = 7262003391214315848152199416269957839331133727741147573486935340389634269495;
    uint256 constant IC2y = 10012650313202462670598615664295140210892957853038638438724241223263947668049;
    
    uint256 constant IC3x = 1928177566109017363402802133738797040975481797322918358200741325561302400454;
    uint256 constant IC3y = 12067623940020893090317984379497306572164795782361805726137036113438756516118;
    
    uint256 constant IC4x = 10437629693195340149628265461695641824400045805225818557457160506900397464437;
    uint256 constant IC4y = 11902526239275458770981920443268952412580865216603551897325663086221299451160;
    
    uint256 constant IC5x = 9283671596968383466329186130031667563069651585896416630407373038571097422996;
    uint256 constant IC5y = 605574171451001393971190795468988486580597579128821373467917749152126179466;
    
    uint256 constant IC6x = 2427307203792922633376670715554088234344382814450139942243373205873507336975;
    uint256 constant IC6y = 20547422953594830279445834481921005062290061263319315424851220379317933488683;
    
    uint256 constant IC7x = 5917076689690122430741691305939630660374553322167817292448308100860195553591;
    uint256 constant IC7y = 17541890143614256583572226317665079122845504652560176654640789429548508460163;
    
    uint256 constant IC8x = 20875604879475524812395282616909107128095122835870070283595699669999897942599;
    uint256 constant IC8y = 11156421256781487693263799905797195900663483653514366885377680404964738033501;
    
    uint256 constant IC9x = 4610499755135851904166040490308687288421637301306815488807269828274196505208;
    uint256 constant IC9y = 7736834070303117528941641718907682234599101895066518228634402226357242700589;
    
    uint256 constant IC10x = 8702418680448490383754706907670667987401593452007299678152128923864228691276;
    uint256 constant IC10y = 5881032354879632913808352814461401451304900857320147716622500840791541606206;
    
    uint256 constant IC11x = 13345797365563389089656745695693672600651846081747335782609355473808742695843;
    uint256 constant IC11y = 15015696521221723062747300876019069975929008408787576834066992765432507196145;
    
    uint256 constant IC12x = 13162285455228457418800902393138599671669641536204441413101071863749252928535;
    uint256 constant IC12y = 20681246448184802310091713346996755311333065653370211440171216676826421447644;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[12] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
