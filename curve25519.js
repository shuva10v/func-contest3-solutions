#!/usr/bin/env node

const {  TvmRunnerAsynchronous, SmartContract, stackInt}  = require("ton-contract-executor");
const { compileFunc } = require("@ton-community/func-js");
const { Cell } = require("ton");
const BN = require('bn.js');

const fs = require('fs').promises;

async function main(args) {
    const code = await fs.readFile('4.fc', "binary");
    const compileResult = await compileFunc({
        sources: {
            'contract.fc': ' #include "stdlib.fc";' +  code + `
            (int,int) add_test(int x1, int y1, int x2, int y2) method_id {
                return add(x1, y1, x2, y2);   
            }

            int mul_test(int x1, int factor) method_id {
                return mul(x1, factor);               
            }`,
            'stdlib.fc': await fs.readFile('stdlib.fc', "binary")
        },
        entryPoints: ['contract.fc'],
    })

    if (compileResult.status === 'error') throw new Error('compilation failed' + JSON.stringify(compileResult))

    const contract = await SmartContract.fromCell(
      Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0],
      new Cell(), {debug: true}
    )
    
    let totalGas = 0;
    async function check_add(P, Q, R) {

        const res = await contract.invokeGetMethod('add_test', [stackInt(P[0]), stackInt(P[1]),
            stackInt(Q[0]), stackInt(Q[1])], {
            gasLimits: {
                limit: 3080000000,
            },
        });
        res.logs = res.logs.slice(-500);
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }
        totalGas += res.gas_consumed;
        if (!R[0].eq(res.result[0])) {
            throw new Error("check_add failed: expected x=" + R[0] + ", got " + res.result[0]);
        }
        if (!R[1].eq(res.result[1])) {
            throw new Error("check_add failed: expected y=" + R[1] + ", got " + res.result[1]);
        }
        console.log("check_add passed");
    }

    async function check_mul(x1, factor, res_x) {

        const res = await contract.invokeGetMethod('mul_test', [stackInt(x1), stackInt(factor)], {
            gasLimits: {
                limit: 3080000000,
            },
        });
        res.logs = res.logs.slice(-500);
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }
        totalGas += res.gas_consumed;
        // console.log(res.result)
        if (res_x !== undefined) {
            if (!res_x.eq(res.result[0])) {
                throw new Error("check_add failed: expected x=" + res_x + ", got " + res.result[0]);
            }
            console.log("check_mul passed");
        }

    }

    const P = [new BN('56391866308239752110494101482511933051315484376135027248208522567059122930692'),
        new BN('17671033459111968710988296061676524036652749365424210951665329683594356030064')];
    const B = [new BN('39028180402644761518992797890514644768585183933988208227318855598921766377692'),
        new BN('17694324391104469229766971147677885172552105420452910290862122102896539285628')];
    const R = [new BN('7769460008531208039267550090770832052561793182665100660016059978850497673345'),
        new BN('50777594312607721283178588283812137388073334114015585272572035433724485979392')];
    await check_add(P, B, R);
    await check_add(B, P, R);

    await check_mul(P[0], new BN('1'), P[0]);

    // doubling: P + P = 2P
    const P2 = [new BN('23949075309284674151271929794126748653254388026092327287149010208642994325102'),
        new BN('36347103481492844990904502898601153028189895911803351321237773753708015314112')];
    await check_add(P, P, P2);

    // 2 * P = 2P
    await check_mul(P[0], new BN('2'), P2[0]);
    //
    // // 2P + 2P = 4P
    const P4 = [new BN('41707806908216107150933211614905026312154955484464515789593741233629885877574'),
        new BN('27172291426892617933704912902385217962562372538879576272432242891972569829060')
    ];
    await check_add(P2, P2, P4);

    // 4 * P = 4P
    await check_mul(P[0], new BN('4'), P4[0]);

    // P + 2P = 3P
    const P3 = [new BN('34652126185538645675766029041548606054561651513925918622252498266987658272038'),
        new BN('2379503563544242384113165057898955730824180271035419437686769825172838889330')];
    await check_add(P, P2, P3);

    // 3 * P = 3P
    await check_mul(P[0], new BN('3'), P3[0]);

    // 3P + 2P = 5P
    const P5 = [new BN('39028180402644761518992797890514644768585183933988208227318855598921766377692'),
        new BN('17694324391104469229766971147677885172552105420452910290862122102896539285628')];
    await check_add(P2, P3, P5);

    // 5 * P = 5P
    await check_mul(P[0], new BN('5'), P5[0]);
    //
    // 3P + 5P = 8P
    const P8 = [new BN('8278229303214901901158248908264827564898752027931161031975514663374163593595'),
        new BN('6041995834444641975894983086332808486639330397794312872906476546484828350370')];
    await check_add(P3, P5, P8);

    // 8 * P = 8P
    await check_mul(P[0], new BN('8'), P8[0]);

    // 2P + 5P = 7P
    const P7 = [new BN('29053750563774311757300892615868819549291759051371703875474394915307747280341'),
        new BN('21444961326538107630304535038373905314003517721436464827835039792236691695899')];
    await check_add(P2, P5, P7);

    // 7 * P = 8P
    await check_mul(P[0], new BN('7'), P7[0]);

    // 7P + 5P = 12P
    const P12 = [new BN('28910205908009737404298196833419791229510247598887883524547531982812240466447'),
        new BN('39351479926431097535672587866133246989640740667550331974484607369273511173624')];
    await check_add(P7, P5, P12);

    // 12 * P = 8P
    await check_mul(P[0], new BN('12'), P12[0]);
    await check_mul(P[0], new BN('1809251394333065553493296640760748560207343510400633813116524750123642650624'),
      new BN('57562131406117242980655998370245162639729379896567189981065094425979854828579'));


    console.log("Total gas consumed: ", totalGas);
    
    await TvmRunnerAsynchronous.getShared().cleanup()
}

main();
