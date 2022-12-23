#!/usr/bin/env node

const {  TvmRunnerAsynchronous, SmartContract, stackSlice}  = require("ton-contract-executor");
const { compileFunc } = require("@ton-community/func-js");
const { Cell, InternalMessage, CommonMessageInfo, CellMessage, beginCell, Address } = require("ton");
const {stackCell, stackNull} = require("ton-contract-executor/dist/executor/executor");


const fs = require('fs').promises;

async function main(args) {
    const code = await fs.readFile('1.fc', "binary");
    const contractAddress = Address.parse('Ef8RERERERERERERERERERERERERERERERERERERERERERlb')

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': '#include "stdlib.fc";' + code,
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

    function flatten(tree) {
        let out = [];
        if (tree instanceof Array) {
            for (node of tree) {
                for (item of flatten(node)) {
                    out.push(item);
                }
            }
        } else {
            return [tree];
        }
        return out;
    }

    function cellStat(cell) {
        let bits = cell.bits.length;
        let cells = 1;
        for (let ref of cell.refs) {
            let s = cellStat(ref);
            bits += s[0];
            cells += s[1];
        }
        return [bits, cells]
    }

    function flatten_tuple(x) {
        let out = [];
        for (let ch of x) {
            if (ch instanceof Array) {
                for (let sub_ch of flatten_tuple(ch)) {
                    out.push(sub_ch);
                }
            } else {
                out.push(ch);
            }
        }
        return out;
    }

    async function check(cell) {
        // console.log("Going to check", cell);
        const addr = beginCell().storeAddress(contractAddress).endCell();
        const res = await contract.invokeGetMethod('decomposite',
          [cell === undefined ? stackNull() : stackCell(cell), stackSlice(addr)]);
        res.logs = res.logs.slice(-500);
        if (res.type != 'success') {
            throw new Error("Failed step: " + JSON.stringify(res));
        }
        const parts = flatten_tuple(res.result[0]);
        if (parts.length > 255) {
            throw new Error("Too manu tuple items " + parts.length);
        }
        totalGas += res.gas_consumed;
        console.log("Got " + parts.length + " parts", res.gas_consumed);
        console.log("Got " + parts.length + " parts", parts);

        let index = 0;
        for (let part of flatten(parts)) {
            let stat = cellStat(part);
            console.log("Part #" + (index + 1) + " bits: " + stat[0] + ", cells: " + stat[1]);
            // if (stat[0] >= 40000 || stat[1] >= 1000 | part.getMaxDepth() > 255) {
            //     throw new Error("Wrong part size" + stat);
            // }
            const res = await contract.sendInternalMessage(new InternalMessage({
                to: contractAddress,
                from: contractAddress,
                value: 1, // 1 nanoton
                bounce: false,
                body: new CommonMessageInfo({
                    body: new CellMessage(part)
                })
            }));


            totalGas += res.gas_consumed;
            if (res.type != 'success') {
                throw new Error("Failed step: " + JSON.stringify(res));
            }

            if (index < parts.length - 1) {
                if (res?.actionList?.length > 0) {
                    throw new Error("Get response before last part sent: " + res?.actionList);
                }
            } else {
                if (res?.actionList?.length !== 1) {
                    throw new Error("Not response after last part sent: " + res?.actionList);
                }
                console.log("Gas", res.gas_consumed);
                const merged = res.actionList[0].message.body;
                if (merged.hash().toString("hex") !== cell.hash().toString("hex")) {
                    console.log("Not equal: ", merged, "Expected: ", cell,
                      cell.hash().toString("hex"));
                    throw new Error("Merged cell match failed")
                } else {
                    let stat = cellStat(merged);
                    console.log("Cells matched (bits=" + stat[0] + ", cells=" + stat[1] +
                      ", depth="+ cell?.getMaxDepth() + ")");
                }
            }
            index++;
        }
    }


    let counter = 1;
    const idCell = (id) => beginCell().storeUint(id, 8).endCell();
    const largeCell = () => beginCell().storeUint(counter++, 512).endCell();
    // const largeCell = () => beginCell().storeUint(1, 1).endCell();
    const withChildren = (node, child1, child2, child3, child4) => {
        let builder = beginCell().storeBitString(node.beginParse().readRemaining());
        // let builder = beginCell().storeCellCopy(node);
        if (child1 !== undefined) builder.storeRef(child1);
        if (child2 !== undefined) builder.storeRef(child2);
        if (child3 !== undefined) builder.storeRef(child3);
        if (child4 !== undefined) builder.storeRef(child4);
        return builder.endCell();
    }


    const recursiveLine4 = (num) => {
        if (num > 0) {
            return withChildren(largeCell(), recursiveLine4(num - 1), recursiveLine4(num - 1), recursiveLine4(num - 1), recursiveLine4(num - 1));
        } else {
            return largeCell();
        }
    }
    const recursiveLine1 = (num) => {
        if (num > 0) {
            return withChildren(largeCell(), recursiveLine1(num - 1));
        } else {
            return largeCell();
        }
    }
    const recursiveLine21 = (num) => {
        if (num > 0) {
            return withChildren(largeCell(), recursiveLine21(num - 1), recursiveLine1(num - 1));
        } else {
            return largeCell();
        }
    }

    const recursiveLine321 = (num) => {
        if (num > 0) {
            return withChildren(largeCell(), recursiveLine321(num - 1), recursiveLine1(num - 1), recursiveLine21(num - 1));
        } else {
            return largeCell();
        }
    }

    const recursiveSnake = (num) => {
        if (num > 0) {
            if (num % 10 == 0 && num < 200) {
                return withChildren(largeCell(), recursiveSnake(num - 1), recursiveLine4(4));
            } else {
                return withChildren(largeCell(), recursiveSnake(num - 1));
            }

        } else {
            return largeCell();
        }
    }

    await check(recursiveLine4(4));
    await check(recursiveLine1(5));
    //
    await check(recursiveLine4(5));
    await check(largeCell());
    await check(recursiveLine1(2));
    await check(recursiveLine1(3));
    await check(recursiveLine4(2));
    await check(recursiveLine4(1));
    await check(recursiveLine1(500));
    await check(recursiveLine1(266));

    await check(recursiveSnake(10));
    await check(recursiveLine321(20));
    await check(recursiveLine4(5));

    await check(beginCell().endCell());
    await check(beginCell().storeUint(100, 32).endCell());
    await check(withChildren(idCell(1),
      idCell(2), idCell(3)));
    await check(largeCell());
    await check(withChildren(largeCell(),
      largeCell(),
      largeCell(),
      largeCell(),
      largeCell()
    ));
    await check(withChildren(largeCell(),
      beginCell().endCell()
    ));
    await check(withChildren(idCell(1),
      idCell(2),
      idCell(3),
      withChildren(idCell(4),
        idCell(5),
        idCell(6),
        idCell(7),
        idCell(8)),
      idCell(9)
    ));
    await check(withChildren(largeCell(),
      withChildren(largeCell(),
        withChildren(largeCell(),
          largeCell(),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
        ),
        withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
        withChildren(largeCell(), largeCell(),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
        ),
        largeCell()
      )
    ));
    await check(withChildren(largeCell(),
      withChildren(largeCell(),
        withChildren(largeCell(),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
        ),
        withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
        withChildren(largeCell(), largeCell(),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
          withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
        ),
        withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
      ),
      withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell()),
      withChildren(largeCell(), largeCell(), largeCell(),
        withChildren(largeCell(), largeCell(),
          withChildren(largeCell(), largeCell(), largeCell(),
            withChildren(largeCell(), largeCell(), largeCell(), largeCell(),
              withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
            ), largeCell()),
          largeCell(), largeCell())
        , largeCell()),
      withChildren(largeCell(), largeCell(), largeCell(), largeCell(), largeCell())
    ));

    console.log("Total gas consumed: ", totalGas);
    
    await TvmRunnerAsynchronous.getShared().cleanup()
}

main();
