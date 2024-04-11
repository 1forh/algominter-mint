# AlgoMinter - Mint Script

This script can be used to mint a new NFT collection on the Algorand blockchain once you've downloaded your collection from [AlgoMinter](https://www.algominter.art/).

## Requirements

- [Node.js v18.17.0 or later](https://nodejs.org/en/download)
- [Algorand Wallet with some ALGO](https://algorandwallet.com/)
- [Pinata API Key](https://docs.pinata.cloud/account-management/api-keys)

## Installation

1. Clone this repository
2. Run `npm install` to install the dependencies
3. Create a `.env` file in the root directory, copy the contents of `.env.example`, and fill in the required values.

## Usage

1. Create and download your collection from [AlgoMinter](https://www.algominter.art/)
2. Unzip the downloaded file and copy the contents to the `input` directory
3. Run `npm run mint` to mint your collection.

It is a good idea to mint your collection with `ALGO_NETWORK=TestNet` in the `.env` file first to test the minting process. Once you are satisfied with the results, you can mint your collection on the mainnet by changing `ALGO_NETWORK=MainNet` in the `.env` file.

## FAQs

### What happens if there is an error?

If there is an error during the minting process, the script will stop and display the error message. You can then fix the issue and run the script again after updating `SKIP_FIRST_N` in the `.env` file to the number of NFTs that were successfully minted.
