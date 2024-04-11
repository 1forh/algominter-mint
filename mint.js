const axios = require('axios');
const algosdk = require('algosdk');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const multihash = require('multihashes');
const cid = require('cids');

require('dotenv').config();

// * Update these values to match your NFT collection
const NFT_NAME = process.env.NFT_NAME;
const NFT_UNIT_NAME = process.env.NFT_UNIT_NAME;
const NFT_DESCRIPTION = process.env.NFT_DESCRIPTION;
const COLLECTION_SIZE = Number(process.env.COLLECTION_SIZE);

if (!NFT_NAME) throw new Error('No NFT name provided');
if (!NFT_UNIT_NAME) throw new Error('No NFT unit name provided');
if (!NFT_DESCRIPTION) throw new Error('No NFT description provided');
if (!COLLECTION_SIZE) throw new Error('No collection size provided');

// * Update these values if you want to skip the first N images
const SKIP_FIRST_N = Number(process.env.SKIP_FIRST_N) || 0;

const NODE_TOKEN = '';
const NODE_ENDPOINT = 'https://xna-mainnet-api.algonode.cloud';
const NODE_ENDPOINT_PORT = 443;
const NODE_TOKEN_TESTNET = '';
const NODE_ENDPOINT_TESTNET = 'https://testnet-api.algonode.cloud';
const NODE_ENDPOINT_PORT_TESTNET = 443;

const PINATA_API_KEYS = [process.env.PINATA_API_KEY_1];
const ALGO_NETWORK = process.env.ALGO_NETWORK || 'TestNet';
const CREATOR_ADDRESS = process.env.CREATOR_ADDRESS;
const CREATOR_PASSPHRASE = process.env.CREATOR_PASSPHRASE;

if (!PINATA_API_KEYS) throw new Error('No Pinata API keys provided');
if (!CREATOR_ADDRESS) throw new Error('No creator address provided');
if (!CREATOR_PASSPHRASE) throw new Error('No creator passphrase provided');

const encoder = new TextEncoder();

const algodClient = new algosdk.Algodv2(
  ALGO_NETWORK === 'TestNet' ? NODE_TOKEN_TESTNET : NODE_TOKEN,
  ALGO_NETWORK === 'TestNet' ? NODE_ENDPOINT_TESTNET : NODE_ENDPOINT,
  ALGO_NETWORK === 'TestNet' ? NODE_ENDPOINT_PORT_TESTNET : NODE_ENDPOINT_PORT
);

const pinFileToIPFS = async (src, name, apiKey) => {
  if (!src) throw new Error('No file path provided');
  if (!apiKey) throw new Error('No Pinata API key provided');

  const formData = new FormData();

  const file = fs.createReadStream(src);
  formData.append('file', file);

  const pinataMetadata = JSON.stringify({
    name,
  });
  formData.append('pinataMetadata', pinataMetadata);

  const pinataOptions = JSON.stringify({
    cidVersion: 0,
  });
  formData.append('pinataOptions', pinataOptions);

  try {
    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxBodyLength: 'Infinity',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.data.IpfsHash) {
      throw new Error(`Failed to pin file to IPFS: ${res.data}`, name);
    }

    return res.data.IpfsHash;
  } catch (error) {
    console.log(error.response.data);
  }
};

const formatArc69 = (data) => {
  const DEFAULT_JSON = {
    standard: 'arc69',
    description: NFT_DESCRIPTION,
    external_url: 'https://www.shittykitties.art',
    mime_type: 'image/png',
  };

  const arc69 = {
    ...DEFAULT_JSON,
    properties: data.properties,
  };

  return arc69;
};

const getInputImagesAndJson = () => {
  const inputDir = path.join(__dirname, './input');
  const inputFiles = fs.readdirSync(inputDir);
  const imageFiles = inputFiles.filter((file) => file.includes('.png'));
  const [metadata] = inputFiles.filter((file) => file.includes('.json'));

  const inputImagesAndJson = imageFiles
    .sort((a, b) => {
      const imageIndexA = Number(a.replace('.png', ''));
      const imageIndexB = Number(b.replace('.png', ''));
      return imageIndexA - imageIndexB;
    })
    .map((file, index) => {
      const image = path.join(inputDir, file);
      const imageName = file.replace('.png', '');
      const imageUnitName = `${NFT_UNIT_NAME}${imageName}`;

      let finalName = `${NFT_NAME} #${imageName}`;

      // get contents of json
      const jsonContents = fs.readFileSync(path.join(inputDir, metadata), 'utf8');
      const jsonArray = JSON.parse(jsonContents);
      const formattedJson = formatArc69(jsonArray[(index + 1).toString()]);

      return { name: finalName, unitName: imageUnitName, image, json: formattedJson, index: index + 1 };
    });

  return inputImagesAndJson;
};

const mintAsset = async function (arc69, assetName, unitName, ipfs) {
  let note = undefined;
  if (arc69 !== undefined) {
    note = encoder.encode(JSON.stringify(arc69));
  }

  const reserve = algosdk.encodeAddress(multihash.decode(new cid(ipfs).multihash).digest);

  const suggestedParams = await algodClient.getTransactionParams().do();
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: CREATOR_ADDRESS,
    note: note,
    suggestedParams: suggestedParams,
    assetName: assetName,
    unitName: unitName,
    assetURL: 'template-ipfs://{ipfscid:0:dag-pb:reserve:sha2-256}',
    total: 1,
    decimals: 0,
    defaultFrozen: false,
    manager: CREATOR_ADDRESS,
    reserve,
  });

  const mainAccountMnemonic = algosdk.mnemonicToSecretKey(CREATOR_PASSPHRASE);
  const txSigned = txn.signTxn(mainAccountMnemonic.sk);
  const txRes = await algodClient.sendRawTransaction(txSigned).do();
  console.log(`✅ Finished with ${assetName} - `, txRes.txId);

  return txSigned;
};

const mintAll = async () => {
  const input = getInputImagesAndJson();

  if (input.length !== COLLECTION_SIZE) {
    throw new Error(`Input size must be ${COLLECTION_SIZE}. Current size is ${input.length}`);
  }

  // check that every item in input array has an image and each property in json.properties
  for (const nft of input) {
    if (!nft.image) throw new Error('No image provided');
    if (!nft.json) throw new Error('No json provided');
    if (!nft.json.properties) throw new Error('No properties provided in json');
  }

  // skip first SKIP_FIRST_N
  const remaining = input.slice(SKIP_FIRST_N);

  console.log(`⏳ Minting ${remaining.length} assets...`);

  for (const nft of remaining) {
    const apiKey = PINATA_API_KEYS[0];
    const ipfs = await pinFileToIPFS(nft.image, nft.name, apiKey);
    await mintAsset(nft.json, nft.name, nft.unitName, ipfs);
  }
};

mintAll();
