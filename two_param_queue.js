#!/usr/bin/env node

const {  TvmRunnerAsynchronous, SmartContract }  = require("ton-contract-executor");
const { compileFunc } = require("@ton-community/func-js");
const { Cell, InternalMessage, CommonMessageInfo, CellMessage, beginCell, Address } = require("ton");
const { isEqualObjects } = require('is-equal-objects');


const fs = require('fs').promises;

async function main(args) {
    const code = await fs.readFile('2.fc', "binary");
    const contractAddress = Address.parse('Ef8RERERERERERERERERERERERERERERERERERERERERERlb')

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': ' #include "stdlib.fc";\n' + code,
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
    async function sendAndCheck(x, y, msg, replies) {
        const messageBody = beginCell()
          .storeUint(x, 32)
          .storeCoins(y)
          .storeRef(beginCell().storeUint(msg, 8).endCell())
          .endCell();

        const res = await contract.sendInternalMessage(new InternalMessage({
            to: contractAddress,
            from: contractAddress,
            value: 1, // 1 nanoton
            bounce: false,
            body: new CommonMessageInfo({
                body: new CellMessage(messageBody)
            })
        }));
        res.logs = res.logs.slice(-500);
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }
        totalGas += res.gas_consumed;
        console.log(res, contract.dataCell, contract.dataCell.refs.length);

        const outgoing = res.actionList.filter(msg => msg.type == 'send_msg')
          .map(msg =>
              ({
                  value: msg.message.info.value.coins.toNumber(),
                  tag: msg.message.body.beginParse().readUint(8).toNumber(),
              })
          );

        const compare = (a, b) => a.value - b.value;
        if (isEqualObjects(replies.sort(compare), outgoing.sort(compare))) {
            console.log("[+] Check passed for x = " + x + ", y = " + y + ", msg = " + msg + ", gas: " + res.gas_consumed);
        } else {
            throw new Error("[!] Expected: " + JSON.stringify(replies) + ", got " + JSON.stringify(outgoing));
        }
    }

    
    // test from the task
    await sendAndCheck(1, 5, 1, []);
    await sendAndCheck(2, 6, 2, []);
    await sendAndCheck(3, 100, 3, []);
    await sendAndCheck(4, 2, 4, []);
    await sendAndCheck(5, 3, 5, []);
    await sendAndCheck(6, 4, 6, []);
    await sendAndCheck(7, 7, 7, []);
    await sendAndCheck(8, 8, 8, []);
    await sendAndCheck(9, 9, 9, []);
    await sendAndCheck(10, 10, 10, []);
    await sendAndCheck(11, 11, 11, []);
    await sendAndCheck(12, 20, 12, [{value:2,tag:4},{value:20,tag:12}]);
    await sendAndCheck(15, 1, 13, []);
    await sendAndCheck(13, 13, 14, [{value:1,tag:13}]);
    await sendAndCheck(14, 14, 15, [{value:14,tag:15},{value:3,tag:5}]);


    console.log("Total gas consumed: ", totalGas);
    
    await TvmRunnerAsynchronous.getShared().cleanup()
}

main();
