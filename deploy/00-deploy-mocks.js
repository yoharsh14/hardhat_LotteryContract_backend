const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat.config");
const BASE_FEE = ethers.utils.parseEther("0.25")
const GAS_PRICE_LINK = 1e9// calculated value based on the gas price of the chain
module.exports = async () => {
    const { getNamedAccounts, deployments } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const args = [BASE_FEE,GAS_PRICE_LINK]
    if(developmentChains.includes(network.name)){
        log("LOCAL NETWORK IS DETECTED!!! DEPLOYING MOCKS>>>>>>>")
        await deploy("VRFCoordinatorV2Mock",{
            contract:"VRFCoordinatorV2Mock",
            from:deployer,
            log:true,
            args:args,
        })
        log("Mocks Deployed!!!")
        log("=------------------------------------------------------------=")
    }
};
module.exports.tags = ["all","mocks"]