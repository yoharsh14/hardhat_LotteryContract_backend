const { run } = require("hardhat");

async function verify(contractAddress, args) {
    console.log("Verifing Contract on etherScan......");

    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        });
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified"))
            console.log("Alreadyy Verified!!!!!");
        else console.log(e);
    }
}
module.exports = { verify };
