const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat.config");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffel", () => {
          let raffle, vrfCoordinatorV2Mock, RaffleEnteranceFee, deployer, interval;
          const chainId = networkConfig.chainId;

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer;
              await deployments.fixture(["all"]);
              raffle = await ethers.getContract("Raffle", deployer);
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
              RaffleEnteranceFee = await raffle.getEntranceFee();
              interval = await raffle.getInterval();
          });

          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState();
                  const interval = await raffle.getInterval();
                  console.log(interval);
                  assert.equal(raffleState.toString(), "0");
                  //   assert.equal(interval, networkConfig[chainId]["interval"]);
              });
          });
          describe("enterRaffle", () => {
              it("revert When you Don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  );
              });
              it("records players when they enter", async () => {
                  //RaffleEnterance Fee
                  await raffle.enterRaffle({ value: RaffleEnteranceFee });
                  const playerFromContract = await raffle.getPlayer(0);
                  assert.equal(playerFromContract, deployer);
              });
              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: RaffleEnteranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  );
              });
              it("doesn't allow entrace when raffel is calculating", async () => {
                  await raffle.enterRaffle({ value: RaffleEnteranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  //We pretend to be chainlink keeper
                  await raffle.performUpkeep([]);
                  await expect(
                      raffle.enterRaffle({ value: RaffleEnteranceFee })
                  ).to.be.revertedWith("Raffle__NotOpen");
              });
              describe("checkUpKeep", () => {
                  it("returns false if people haven't sent any ETH", async () => {
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                      await network.provider.request({ method: "evm_mine", params: [] });
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                      assert(!upkeepNeeded);
                  });
                  it("returns false if raffle isn't open", async () => {
                      await raffle.enterRaffle({ value: RaffleEnteranceFee });
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                      await network.provider.request({ method: "evm_mine", params: [] });
                      await raffle.performUpkeep([]);
                      const raffleState = await raffle.getRaffleState();
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                      assert.equal(raffleState.toString() == "1", !upkeepNeeded);
                  });
                  it("returns false if enough time hasn't passed", async () => {
                      await raffle.enterRaffle({ value: RaffleEnteranceFee });
                      await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]);
                      await network.provider.request({ method: "evm_mine", params: [] });
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                      assert.isUndefined(upkeepNeeded);
                  });
                  it("returns true if enough time has passed, has plyers, eth,and is open", async () => {
                      await raffle.enterRaffle({ value: RaffleEnteranceFee });
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                      await network.provider.request({ method: "evm_mine", params: [] });
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                      assert.isNotFalse(upkeepNeeded);
                  });
              });
          });
          describe("performUpKeep", () => {
              it("it can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: RaffleEnteranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const tx = await raffle.performUpkeep("0x");
                  //   console.log(tx);
                  assert.isNotEmpty(tx);
              });
              it("revert when checkupkeep is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  );
              });
              it("updates the raffle state, emits and event, and calls the vrf coordinator", async () => {
                  await raffle.enterRaffle({ value: RaffleEnteranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const txResponse = await raffle.performUpkeep("0x");
                  const txReceipt = await txResponse.wait(1);
                  const raffleState = await raffle.getRaffleState();
                  const requestId = txReceipt.events[1].args.requestId;
                  assert(requestId.toNumber() > 0);
                  assert(raffleState == 1);
              });
          });
          describe("fulfillRandomWords", () => {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: RaffleEnteranceFee });
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
              });
              it("can only be called after performUpkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
              });

              it("picks a winner, resets the lottery,and send money", async () => {
                  const additionalEntrants = 3;
                  const startingAccountIndex = 1; //deployer= 0
                  let accounts = await ethers.getSigners();
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i]);
                      await accountConnectedRaffle.enterRaffle({ value: RaffleEnteranceFee });
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp();

                  // performUpKeep (mock being chainlink keepers)
                  // fulfillRandomWords (mock being the chainLink VRF)
                  // we will have to wait for the fulfillRandomWords to be called
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("FOUND THE EVENT!!");
                          try {
                              const recentWinner = await raffle.getWinner();
                              console.log(recentWinner);
                              console.log(accounts[0].address);
                              console.log(accounts[1].address);
                              console.log(accounts[2].address);
                              console.log(accounts[3].address);
                              const raffleState = await raffle.getRaffleState();
                              const endingTimeStamp = await raffle.getLastTimeStamp();
                              const numPlayers = await raffle.getNumberOfPlayers();
                              const winnerEndingBalance = await accounts[1].getBalance();
                              assert.equal(numPlayers.toString(), "0");
                              assert.equal(raffleState.toString(), "0");
                              assert.isAbove(startingTimeStamp, endingTimeStamp);
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      RaffleEnteranceFee.mul(additionalEntrants)
                                          .add(RaffleEnteranceFee)
                                          .toString()
                                  )
                              );
                          } catch (e) {
                              reject(e);
                          }
                          resolve();
                      });

                      //setting up the listener
                      //below, we will fire teh event, and the listener will pick it up, and resolve
                      const tx = await raffle.performUpkeep([]);
                      const txReceipt = await tx.wait(1);
                      const winnerStartingBalance = await accounts[1].getBalance();
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      );
                  });
              });
          });
      });
