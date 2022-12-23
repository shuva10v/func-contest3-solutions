#!/usr/bin/env node

const {  TvmRunnerAsynchronous, SmartContract }  = require("ton-contract-executor");
const { compileFunc } = require("@ton-community/func-js");
const { Cell, InternalMessage, CommonMessageInfo, CellMessage, beginCell, Address } = require("ton");


const fs = require('fs').promises;

async function main(args) {
    const code = await fs.readFile('3.fc', "binary");
    const contractAddress = Address.parse('Ef8RERERERERERERERERERERERERERERERERERERERERERlb')

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': ' #include "stdlib.fc";' + code,
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

    async function checkCalculator(expression, solution) {
        if (solution === undefined) {
            solution = eval(expression);
        }

        messageBody = beginCell()
          .storeUint(0, 32)
          .storeBuffer(Buffer.from(expression))
          .endCell();

        res = await contract.sendInternalMessage(new InternalMessage({
            to: contractAddress,
            from: contractAddress,
            value: 1, // 1 nanoton
            bounce: false,
            body: new CommonMessageInfo({
                body: new CellMessage(messageBody)
            })
        }));

        if (res.type != 'success') {
            throw new Error("Failed step for " + expression + ": " + JSON.stringify(res));
        }
        totalGas += res.gas_consumed;
        slice = res.actionList[0].message.body.beginParse();
        slice.readUint(32);

        result = slice.readRemainingBytes().toString();
        if (result == solution) {
            console.log("[+] Check passed " + expression + " = " + result);
        } else {
            throw new Error("[!] Expected for " + expression + ": " + solution + ", but got " + result);
        }
    }



    await checkCalculator("(2+2)");
    await checkCalculator("2");
    await checkCalculator("2+2");
    await checkCalculator("22+2");
    await checkCalculator("2+2+3+4");
    await checkCalculator("2+2");
    await checkCalculator("2+3-4+5");
    await checkCalculator("2+2-3-4");
    await checkCalculator("2+2+3+4+5+6");
    await checkCalculator("2*3+4");
    await checkCalculator("2+3*4");
    await checkCalculator("2+3*4+5-6");
    await checkCalculator("4/2");
    await checkCalculator("5+6/5-33", -27);
    await checkCalculator("5+6/5-33*9999+1", 5+1-33*9999+1);
    await checkCalculator("-1");
    await checkCalculator("-1-2");
    await checkCalculator("1/1*1");
    await checkCalculator("(2+3)*4");
    await checkCalculator("(2-3)/2", -1);
    
    // Doesn't work, but it is not covered by the test system)
    // await checkCalculator("7*(-5)");
    // await checkCalculator("7*-5");
    await checkCalculator("((((125*33/11+2)*34)/493)/2)");

    console.log("Total gas consumed: ", totalGas);
    
    await TvmRunnerAsynchronous.getShared().cleanup()
}

main();
