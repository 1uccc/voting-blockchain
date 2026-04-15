const MultiElection = artifacts.require("MultiElection");

module.exports = async function (deployer) {
  await deployer.deploy(MultiElection);
};
