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

contract MpcPricedSettlementVerifier {
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

    
    uint256 constant IC0x = 12937377537896321904801013998657108963878724512134980994902564111894206749976;
    uint256 constant IC0y = 19380288775629388407132639105424491824237214719767686083188223827161848992606;
    
    uint256 constant IC1x = 19080452180711909848228645494073507190733826191988762845259695470431753992095;
    uint256 constant IC1y = 2452829647729785999545203558408304110739346587313767163880538599895417117092;
    
    uint256 constant IC2x = 14128113825339215825085903465560701633248431836086664558956780043460555291121;
    uint256 constant IC2y = 14604964127133521811094183215046021573281852648266528318534361992830811258824;
    
    uint256 constant IC3x = 7263231837439550816635132408912489596792479363930119843249396456382776729769;
    uint256 constant IC3y = 4829780678033397339968464517224150448422805791381730114013188103346653093910;
    
    uint256 constant IC4x = 13298837459777863367921395460988449082289948827504669798808209720460738195552;
    uint256 constant IC4y = 13965763801139347673117395399521684981726342225470904763592208376527499902806;
    
    uint256 constant IC5x = 16564106568319764467312620376485877963430212223777362753122958254794865443827;
    uint256 constant IC5y = 3864726376710530275911309372578429563651851009070040958431191721213269855759;
    
    uint256 constant IC6x = 18460154555762013993936336897454680216429280001803254848025599096391820505871;
    uint256 constant IC6y = 13359671006043668559249199894464279851669419548931411761981394702790397638215;
    
    uint256 constant IC7x = 14760997331977114020006367733377006946475184458629313190411555289727333333129;
    uint256 constant IC7y = 14817314787963858424952615171952185487993733110067674213019627451679157962157;
    
    uint256 constant IC8x = 16096149215867584759993049352162544751419709979656673755962073398627782411155;
    uint256 constant IC8y = 13701131775888497928688630801153301306251368478065034446923759955048560465778;
    
    uint256 constant IC9x = 10887679112603532418717776792592573537196940381814022322118797948766151730441;
    uint256 constant IC9y = 6780491661366623410906250554898709683510297856112705270907619809079236108843;
    
    uint256 constant IC10x = 11061493928798977050228353633122185593140571254362780221336189118286871310899;
    uint256 constant IC10y = 19185484399471535197693693314608442274088893753806475411555224787702694724937;
    
    uint256 constant IC11x = 1582407572838840575099769231613119856824597876798040700558353885310563735490;
    uint256 constant IC11y = 21368794207790603955530947903277648342206400771061477908365190085773934617870;
    
    uint256 constant IC12x = 10851173022610258967099488835234911417738875999823308960637630476011364104555;
    uint256 constant IC12y = 641288569472877688720685400448321618310325432325093336968996558648582711502;
    
    uint256 constant IC13x = 8165778445572266554785802833380444371691750620144858134078424901850862593692;
    uint256 constant IC13y = 5482055857151501627841138372170944951894082014839896151339804500362695786743;
    
    uint256 constant IC14x = 21868357380735589075752254684697910849168396327521298189965492102037285283999;
    uint256 constant IC14y = 4262011893292634884913565725100343447097534231109945480847520097266585187389;
    
    uint256 constant IC15x = 3105596378287533860201388020159152817447774760285352681729628220683256407963;
    uint256 constant IC15y = 1218362016824500999989408985396308635010788767613652707230378597364833310303;
    
    uint256 constant IC16x = 1296320157703086694800205308913320365671579844892106582236869607286631632669;
    uint256 constant IC16y = 10498572897308167913521567548478855471593226801190866440070463277757397535112;
    
    uint256 constant IC17x = 2826268971688639763493872235379496853227670525271101383228026386729290789724;
    uint256 constant IC17y = 6371333084421894072479328676177695973923045116545089271996633115559885965268;
    
    uint256 constant IC18x = 7573645292382429703209282536081351064620287447080379494525964479741106105667;
    uint256 constant IC18y = 10274138760743126966135880082306788617291474877086916941443792537403985296164;
    
    uint256 constant IC19x = 14371874420517610022395029847908295542804265809627309273686511938628411851875;
    uint256 constant IC19y = 16292216436124312263479471469679772464709835615643278736772855439875316213456;
    
    uint256 constant IC20x = 7137348023153178392581018274498658255861392161721555871319189881147786426453;
    uint256 constant IC20y = 6967552259552334713445546105739878519042374290733432077899334247861498751868;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[20] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                

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
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
