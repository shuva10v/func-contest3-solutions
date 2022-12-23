#!/usr/bin/env node

const {  TvmRunnerAsynchronous, SmartContract}  = require("ton-contract-executor");
const { compileFunc } = require("@ton-community/func-js");
const { Cell, InternalMessage, CommonMessageInfo, CellMessage, beginCell, Address } = require("ton");


const fs = require('fs').promises;


async function main(args) {
    const code = await fs.readFile('5.fc', "binary");
    const contractAddress = Address.parse('EQD0vdSA_NedR9uvbgN9EikRX-suesDxGeFg69XQMavfLqIw')

    async function deployContract() {
        return await SmartContract.fromCell(
          Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0],
          new Cell(), {debug: false}
        )
    }

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': '#include "stdlib.fc";' + code,
            'stdlib.fc': await fs.readFile('stdlib.fc', "binary")
        },
        entryPoints: ['contract.fc'],
    })

    if (compileResult.status === 'error') throw new Error('compilation failed' + JSON.stringify(compileResult))

    let contract = await deployContract();
    
    let totalGas = 0;

    async function stake(from, stake, max_factor) {
        console.log("Sending stake from " + from + ", value=" + stake + ", factor=" + max_factor);
        const msg = beginCell()
          .storeUint(0x5ce28eea, 32)
          .storeUint(0, 64)
          .storeUint(max_factor, 24)
          .endCell();

        const res = await contract.sendInternalMessage(new InternalMessage({
            to: contractAddress,
            from: from,
            value: stake,
            bounce: false,
            body: new CommonMessageInfo({
                body: new CellMessage(msg)
            })
        }));
        totalGas += res.gas_consumed;
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }
    }

    async function tryElect(query_id, total_winners, total_effective_stake, unused_stake, exit_code) {
        console.log("Sending try_elect with query " + query_id);
        const msg = beginCell()
          .storeUint(0x207fa5f5, 32)
          .storeUint(query_id, 64)
          .endCell();

        const res = await contract.sendInternalMessage(new InternalMessage({
            to: contractAddress,
            from: contractAddress,
            value: 1,
            bounce: false,
            body: new CommonMessageInfo({
                body: new CellMessage(msg)
            })
        }));
        totalGas += res.gas_consumed;
        if (exit_code !== undefined) {
            if (exit_code == res.exit_code) {
                console.log("try_elect failed as expected");
                return;
            } else {
                throw new Error("Not failed, or wrong exit_code: " + JSON.stringify(res));
            }
        }
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }

        if (res?.actionList?.length == 0) {
            throw new Error("No response for try_elect!");
        }

        const response = res.actionList[0].message.body;
        const s = response.beginParse();
        const op_id = s.readUintNumber(32);
        if (op_id != 0xeefa5ea4) {
            throw new Error("Wrong response op_id:" + op_id);
        }
        const response_id = s.readUintNumber(64);
        if (response_id != query_id) {
            throw new Error("Wrong response query_id:" + response_id);
        }
        const total_winners_actual = s.readUintNumber(32);
        if (total_winners_actual != total_winners) {
            throw new Error("Wrong total_winners:" + total_winners_actual);
        }
        const total_effective_stake_actual = s.readCoins().toNumber();
        if (total_effective_stake_actual != total_effective_stake) {
            throw new Error("Wrong total_effective_stake:" + total_effective_stake_actual);
        }
        const unused_stake_actual = s.readCoins().toNumber();
        if (unused_stake_actual != unused_stake) {
            throw new Error("Wrong unused_stake:" + unused_stake);
        }
    }

    async function validateStakeTable(winners_expected, losers_expected) {
        const res = await contract.invokeGetMethod('get_stake_table',
          []);
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }
        const converter = (item) => ([item[0].readAddress(), item[1].toNumber()]);

        const winners = res.result[0].map(converter);
        const losers = res.result[1].map(converter);
        const comparator = (a, b) => {
            if (a[0] > b[0]) {
                return 1;
            } else if (a[0] < b[0]) {
                return -1;
            } else {
                return 0;
            }
        }
        const listsEquals = (a, b) => {
            if (a.constructor.name === 'Array') {
                if (a.length != b.length) {
                    return false;
                }
                for (let i = 0; i < a.length; i++) {
                    if (!listsEquals(a[i], b[i])) {
                        return false;
                    }
                }
                return true;
            } else if (a.constructor.name === 'Address') {
                return a.equals(b);
            } else if (a.constructor.name === 'Number') {
                return a === b;
            } else {
                throw new Error("Cant compare " + a + " " + b);
            }
        }
        if (!listsEquals(winners.sort(comparator), winners_expected.sort(comparator))) {
            console.log(winners.sort(comparator), winners_expected.sort(comparator));
            throw new Error("Winners mismatch");
        }
        if (!listsEquals(losers.sort(comparator), losers_expected.sort(comparator))) {
            console.log(losers, losers_expected);
            throw new Error("Losers mismatch!");
        }
        console.log("Table validated!");

        return res;
    }

    const A1 = Address.parse('Ef8RERERERERERERERERERERERERERERERERERERERERERlb');
    const A2 = Address.parse('Ef8iIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiImKK');
    const A3 = Address.parse('Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF');
    const A4 = Address.parse('Ef9ERERERERERERERERERERERERERERERERERERERERERJUo');
    const A5 = Address.parse('Ef9VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVbxn');
    const A6 = Address.parse('EQD0vdSA_NedR9uvbgN9EikRX-suesDxGeFg69XQMavfLqIw');

    // Basic test
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 10);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await stake(A5, 1, 65536);
    await tryElect(100500, 5, 14, 10);
    await validateStakeTable([
      [A1, 10], [A2, 1], [A3, 1], [A4, 1], [A5, 1]
    ], [[A1, 10]]);
    console.log("Total gas consumed: ", totalGas);

    // equal stake
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 1, 65536);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await stake(A5, 1, 65536);
    await tryElect(100500, 5, 5, 0);
    await validateStakeTable([
        [A1, 1], [A2, 1], [A3, 1], [A4, 1], [A5, 1]
    ], []);
    console.log("Total gas consumed: ", totalGas);

    // equal stake
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 1, 65536);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await stake(A5, 1, 65536);
    await tryElect(100500, 5, 5, 0);
    await validateStakeTable([
        [A1, 1], [A2, 1], [A3, 1], [A4, 1], [A5, 1]
    ], []);
    console.log("Total gas consumed: ", totalGas);

    // equal stake
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 1, 65536);
    await stake(A2, 1, 65536 * 3);
    await stake(A3, 1, 655360);
    await stake(A4, 1, 65536 * 2);
    await stake(A5, 1, 65536);
    await tryElect(100500, 5, 5, 0);
    await validateStakeTable([
        [A1, 1], [A2, 1], [A3, 1], [A4, 1], [A5, 1]
    ], []);
    console.log("Total gas consumed: ", totalGas);

    // adding stake
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 10);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await stake(A4, 2, 65536 * 2); // max_factor give him +1 effective_stake, but 1 leaves as an excess
    await stake(A5, 1, 65536);
    await tryElect(100500, 5, 15, 11);
    await validateStakeTable([
        [A1, 10], [A2, 1], [A3, 1], [A4, 2], [A5, 1]
    ], [[A1, 10], [A4, 1]]);
    console.log("Total gas consumed: ", totalGas);

    // max and min
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 100);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 5);
    await stake(A4, 2, 65536 * 2); // max_factor give him +1 effective_stake, but 1 leaves as an excess
    await stake(A5, 1, 65536);
    await tryElect(100500, 5, 15, 11);
    await validateStakeTable([
        [A1, 10], [A2, 1], [A3, 1], [A4, 2], [A5, 1]
    ], [[A1, 10], [A4, 1]]);
    console.log("Total gas consumed: ", totalGas);

    // at least 5 participants case
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 10);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await tryElect(100500, undefined, undefined, undefined, 404);
    console.log("Total gas consumed: ", totalGas);

    // at least 5 participants case
    contract = await deployContract();
    totalGas = 0;
    await tryElect(100500, undefined, undefined, undefined, 404);
    console.log("Total gas consumed: ", totalGas);

    // 6 participants
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 4);
    await stake(A2, 2, 65536 * 2);
    await stake(A3, 2, 65536 * 2);
    await stake(A4, 2, 65536 * 2);
    await stake(A5, 2, 65536 * 2);
    await stake(A6, 2, 65536 * 2);
    await tryElect(100500, 6, 18, 12);
    await validateStakeTable([
        [A1, 8], [A2, 2], [A3, 2], [A4, 2], [A5, 2], [A6, 2]
    ], [[A1, 12]]);
    console.log("Total gas consumed: ", totalGas);

    // ignore the last one for more optimal set
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 4);
    await stake(A2, 2, 65536 * 2);
    await stake(A3, 2, 65536 * 2);
    await stake(A4, 2, 65536 * 2);
    await stake(A5, 2, 65536 * 2);
    await stake(A6, 1, 65536 * 2);
    await tryElect(100500, 5, 16, 13);
    await validateStakeTable([
        [A1, 8], [A2, 2], [A3, 2], [A4, 2], [A5, 2]
    ], [[A1, 12], [A6, 1]]);
    console.log("Total gas consumed: ", totalGas);

    // equal max_factor
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536);
    await stake(A2, 1, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await stake(A5, 1, 65536);
    await stake(A6, 1, 65536);
    await tryElect(100500, 6, 6, 19);
    await validateStakeTable([
        [A1, 1], [A2, 1], [A3, 1], [A4, 1], [A5, 1], [A6, 1]
    ], [[A1, 19]]);
    console.log("Total gas consumed: ", totalGas);

    // equal max_factor
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 655360);
    await stake(A2, 1, 655360);
    await stake(A3, 1, 655360);
    await stake(A4, 1, 655360);
    await stake(A5, 1, 655360);
    await stake(A6, 1, 655360);
    await tryElect(100500, 6, 15, 10);
    await validateStakeTable([
        [A1, 10], [A2, 1], [A3, 1], [A4, 1], [A5, 1], [A6, 1]
    ], [[A1, 10]]);
    console.log("Total gas consumed: ", totalGas);


    // equal max_factor
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 165536);
    await stake(A2, 1, 165536);
    await stake(A3, 1, 165536);
    await stake(A4, 1, 165536);
    await stake(A5, 1, 165536);
    await stake(A6, 1, 165536);
    await tryElect(100500, 6, 7, 18);
    await validateStakeTable([
        [A1, 2], [A2, 1], [A3, 1], [A4, 1], [A5, 1], [A6, 1]
    ], [[A1, 18]]);
    console.log("Total gas consumed: ", totalGas);

    // zero stake then update
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536);
    await stake(A2, 1, 65536);
    await stake(A3, 0, 65536);
    await stake(A3, 1, 65536);
    await stake(A4, 1, 65536);
    await stake(A5, 1, 65536);
    await stake(A6, 1, 65536);
    await tryElect(100500, 6, 6, 19);
    await validateStakeTable([
        [A1, 1], [A2, 1], [A3, 1], [A4, 1], [A5, 1], [A6, 1]
    ], [[A1, 19]]);
    console.log("Total gas consumed: ", totalGas);

    // large stake
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20 * 1000, 65536);
    await stake(A2, 1000, 65536);
    await stake(A3, 1000, 65536);
    await stake(A4, 1000, 65536);
    await stake(A5, 1000, 65536);
    await stake(A6, 1000, 65536);
    await tryElect(100500, 6, 6 * 1000, 19000);
    await validateStakeTable([
        [A1, 1000], [A2, 1000], [A3, 1000], [A4, 1000], [A5, 1000], [A6, 1000]
    ], [[A1, 19 * 1000]]);
    console.log("Total gas consumed: ", totalGas);

    // multiple elects
    contract = await deployContract();
    totalGas = 0;
    await stake(A1, 20, 65536 * 4);
    await stake(A2, 2, 65536 * 2);
    await stake(A3, 2, 65536 * 2);
    await stake(A4, 2, 65536 * 2);
    await stake(A5, 2, 65536 * 2);
    await stake(A6, 1, 65536 * 2);
    await tryElect(100500, 5, 16, 13);
    await validateStakeTable([
        [A1, 8], [A2, 2], [A3, 2], [A4, 2], [A5, 2]
    ], [[A1, 12], [A6, 1]]);
    console.log("Total gas consumed: ", totalGas);

    await TvmRunnerAsynchronous.getShared().cleanup()
}

main();
