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

contract WithdrawVerifier {
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

    
    uint256 constant IC0x = 8300484576923568759724088955924580480265513089323704974482355147564627137598;
    uint256 constant IC0y = 6184777068864857717246508885111825125914407139000608586406892866528193713816;
    
    uint256 constant IC1x = 10509729748313027936608355829990219463145238236287528339062789098587923346972;
    uint256 constant IC1y = 17173365611996372083323542457783785424467743720852579656778385501899050827244;
    
    uint256 constant IC2x = 4405632897706566144047209588215445778632954907375023744525655308094597160463;
    uint256 constant IC2y = 15985271074720484856943198610728125919518144604437840730324084259073668813788;
    
    uint256 constant IC3x = 15990443795089386309837537021229955365090257829216478374473957444400102297963;
    uint256 constant IC3y = 3603221749650831129777064802601481827490375506769534705954979000882857116694;
    
    uint256 constant IC4x = 17342000879165474801354619553648992946401244009704214130430996503935869290589;
    uint256 constant IC4y = 9788338132447169598414822537366385779579613188761866214548820669531919344828;
    
    uint256 constant IC5x = 17100331603603941746025341468026347083898887665367662321545841107387550464354;
    uint256 constant IC5y = 17167582536371585102450829871213930670443486281554448891707126160037749059708;
    
    uint256 constant IC6x = 629036270952185964681845329977021108541554018506109143329272193745829671031;
    uint256 constant IC6y = 14993207985456489100963431811206189008663461992420764687189924940643359766097;
    
    uint256 constant IC7x = 5025488261562607647068458949760976900476565878842692895837212849980393042464;
    uint256 constant IC7y = 7447051209130319579723800781249937353821567923936371389177048640438131276178;
    
    uint256 constant IC8x = 16169017237626347125736730974159576245388842637692170181157250121681655380922;
    uint256 constant IC8y = 11875231372124954094495297636719798496805144756900880177473939022671501813323;
    
    uint256 constant IC9x = 11632603987800690035963564726932391283577894609943891808722379883273005521869;
    uint256 constant IC9y = 9643700151907434419875120634747115020152434902264804432063904620030217327965;
    
    uint256 constant IC10x = 15762237916895205815282290324275648147455771290417480493940659705956810044930;
    uint256 constant IC10y = 15371354132414284202815274500968398090288425096719947681071871454361606279247;
    
    uint256 constant IC11x = 7687302379953430537590981714770380160989084814587354195357887568540367212871;
    uint256 constant IC11y = 20854378612559269647837373316450047097432840138596961595565967759021806575442;
    
    uint256 constant IC12x = 10397530911925527836713887920865316896591749370406468620994970592065510119279;
    uint256 constant IC12y = 7516466974478774160845385017277388030450426954298911605088152227698866987240;
    
    uint256 constant IC13x = 5961615795732481702010277756668150634289852019329525030585480294349174616616;
    uint256 constant IC13y = 12426465160113045023856725571241589781513445760210706383679825486711257974511;
    
    uint256 constant IC14x = 17100657411656497703753379294808458012613833395856246480126081264830906726914;
    uint256 constant IC14y = 2074458467480139355922023272942580399639160713386041704748188863383686538155;
    
    uint256 constant IC15x = 7418626224998250149829762693548790787224848978586210306200753847316458425648;
    uint256 constant IC15y = 3574578693790799784605913507991151542611852484179700720673932331630330563207;
    
    uint256 constant IC16x = 18613843977959062881598292987286121010757819333808074606423155729338677256280;
    uint256 constant IC16y = 3985498220138634119166093568760281758690281344289837720069485720485415174704;
    
    uint256 constant IC17x = 16528461866761965817698982650996894798552393491450922396026464955610162116350;
    uint256 constant IC17y = 18545857042000126780603201672649878924404108979052695532705991063803398911449;
    
    uint256 constant IC18x = 17913988533431055388322003761573103228081649235655350250382401208340682111092;
    uint256 constant IC18y = 2625802245431780389954053985871753791944560076227610122264707295309568173729;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[18] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
