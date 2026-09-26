import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createInitializeMintInstruction,
  getMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'

const TESTNET_GENESIS = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://solana-testnet-rpc.publicnode.com'
const DECIMALS = 9
const root = fileURLToPath(new URL('../', import.meta.url))
const secretPath = [
  resolve(root, '..', 'key.txt'),
  resolve(root, '..', '..', 'key.txt'),
  resolve(root, 'key.txt'),
].find(existsSync)
if (!secretPath) throw new Error('Place the local signer in key.txt outside the frontend repository.')
const manifestPath = resolve(root, 'deployments', 'solana-testnet.json')

function writeManifest(record) {
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
}

const encodedSeed = readFileSync(secretPath, 'utf8').replace(/^\uFEFF/, '').trim()
if (!/^[a-f\d]{64}$/i.test(encodedSeed)) {
  throw new Error('key.txt must contain the local 32-byte hexadecimal signer seed.')
}

const seed = Buffer.from(encodedSeed, 'hex')
const authority = Keypair.fromSeed(seed)
const mintSeed = createHash('sha256')
  .update(seed)
  // Preserve the original deterministic seed so the deployed ORL mint remains address-stable after the display rebrand.
  .update('OrbiVela::ORL::SolanaTestnetMint::v1')
  .digest()
seed.fill(0)
const mint = Keypair.fromSeed(mintSeed)
mintSeed.fill(0)

const connection = new Connection(RPC_URL, 'confirmed')
const genesis = await connection.getGenesisHash()
if (genesis !== TESTNET_GENESIS) {
  throw new Error(`RPC is not Solana Testnet (genesis ${genesis}); no transaction was sent.`)
}

const balance = await connection.getBalance(authority.publicKey, 'confirmed')
if (balance < 0.02 * LAMPORTS_PER_SOL) {
  throw new Error('Signer balance is below the 0.02 SOL safety threshold; no transaction was sent.')
}

const address = mint.publicKey.toBase58()
const existing = await connection.getAccountInfo(mint.publicKey, 'confirmed')
if (existing) {
  if (!existing.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error('The deterministic mint address already exists under another program; no transaction was sent.')
  }
  const state = await getMint(connection, mint.publicKey, 'confirmed', TOKEN_PROGRAM_ID)
  if (
    state.decimals !== DECIMALS ||
    !state.mintAuthority?.equals(authority.publicKey) ||
    state.freezeAuthority !== null
  ) {
    throw new Error('The existing mint at the deterministic address has unexpected settings; no transaction was sent.')
  }
  const signatures = await connection.getSignaturesForAddress(mint.publicKey, { limit: 1 })
  const previous = (() => {
    try { return JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { return null }
  })()
  const record = {
    name: 'VelaCircuit',
    symbol: 'ORL',
    cluster: 'testnet',
    tokenStandard: 'SPL Token',
    tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    mint: address,
    decimals: state.decimals,
    supply: state.supply.toString(),
    mintAuthority: authority.publicKey.toBase58(),
    freezeAuthority: null,
    onChainMetadata: false,
    status: 'deployed',
    transaction: previous?.mint === address
      ? previous.transaction || signatures[0]?.signature || null
      : signatures[0]?.signature ?? null,
    explorer: `https://explorer.solana.com/address/${address}?cluster=testnet`,
    verifiedAt: new Date().toISOString(),
  }
  writeManifest(record)
  console.log(JSON.stringify({ ...record, signerBalanceSol: balance / LAMPORTS_PER_SOL }, null, 2))
  process.exit(0)
}

const record = {
  name: 'VelaCircuit',
  symbol: 'ORL',
  cluster: 'testnet',
  tokenStandard: 'SPL Token',
  tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
  mint: address,
  decimals: DECIMALS,
  supply: '0',
  mintAuthority: authority.publicKey.toBase58(),
  freezeAuthority: null,
  onChainMetadata: false,
  status: 'pending',
  transaction: null,
  explorer: `https://explorer.solana.com/address/${address}?cluster=testnet`,
  createdAt: new Date().toISOString(),
}
writeManifest(record)

const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, 'confirmed')
const transaction = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: mint.publicKey,
    lamports: rent,
    space: MINT_SIZE,
    programId: TOKEN_PROGRAM_ID,
  }),
  createInitializeMintInstruction(mint.publicKey, DECIMALS, authority.publicKey, null, TOKEN_PROGRAM_ID),
)

const signature = await sendAndConfirmTransaction(connection, transaction, [authority, mint], {
  commitment: 'confirmed',
  preflightCommitment: 'confirmed',
})
const state = await getMint(connection, mint.publicKey, 'confirmed', TOKEN_PROGRAM_ID)
if (
  state.decimals !== DECIMALS ||
  state.supply !== 0n ||
  !state.mintAuthority?.equals(authority.publicKey) ||
  state.freezeAuthority !== null
) {
  throw new Error(`Mint transaction confirmed (${signature}) but its on-chain state failed verification.`)
}

const deployed = {
  ...record,
  status: 'deployed',
  transaction: signature,
  rentLamports: rent,
  verifiedAt: new Date().toISOString(),
}
writeManifest(deployed)
console.log(JSON.stringify({ ...deployed, signerBalanceSol: balance / LAMPORTS_PER_SOL }, null, 2))
