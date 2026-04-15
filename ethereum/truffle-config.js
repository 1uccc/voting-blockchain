/**
 * Truffle config for Ganache.
 *
 * Ganache GUI default:
 * - RPC: http://127.0.0.1:7545
 * - Network ID: 5777
 *
 * If your Ganache uses different settings, edit host/port/network_id below.
 */
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
    },
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
};

