import { describe, it, expect, beforeEach } from "vitest";

// Types for TypeScript
interface Swap {
  offerer: string;
  offeredNftContract: string;
  offeredNftId: bigint;
  requestedNftContract: string;
  requestedNftId: bigint;
  counterparty: string | null;
  deadline: bigint;
  accepted: boolean;
  cancelled: boolean;
  completed: boolean;
}

interface MockNftTrait {
  owners: Map<bigint, string>;
  transfer(tokenId: bigint, sender: string, recipient: string): { value: boolean } | { error: number };
  getOwner(tokenId: bigint): { value: string | null } | { error: number };
}

interface MockContract {
  admin: string;
  paused: boolean;
  treasury: string;
  swapCounter: bigint;
  swaps: Map<bigint, Swap>;
  userSwapHistory: Map<string, bigint[]>;
  nftContracts: Map<string, MockNftTrait>;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  createSwapOffer(
    caller: string,
    offeredNftContractAddr: string,
    offeredNftId: bigint,
    requestedNftContractAddr: string,
    requestedNftId: bigint,
    counterparty: string | null,
    deadline: bigint
  ): { value: bigint } | { error: number };
  acceptSwap(
    caller: string,
    swapId: bigint,
    requestedNftContractAddr: string
  ): { value: boolean } | { error: number };
  cancelSwap(
    caller: string,
    swapId: bigint,
    offeredNftContractAddr: string
  ): { value: boolean } | { error: number };
  getSwap(swapId: bigint): Swap | undefined;
  getUserHistory(user: string): bigint[];
}

// Mock NFT trait implementation
const createMockNft = (): MockNftTrait => ({
  owners: new Map(),
  transfer(tokenId: bigint, sender: string, recipient: string) {
    const owner = this.owners.get(tokenId);
    if (owner !== sender) return { error: 101 };
    this.owners.set(tokenId, recipient);
    return { value: true };
  },
  getOwner(tokenId: bigint) {
    const owner = this.owners.get(tokenId);
    return owner ? { value: owner } : { value: null };
  },
});

// Mock contract state
const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  treasury: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  swapCounter: 0n,
  swaps: new Map(),
  userSwapHistory: new Map(),
  nftContracts: new Map(),

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  createSwapOffer(
    caller: string,
    offeredNftContractAddr: string,
    offeredNftId: bigint,
    requestedNftContractAddr: string,
    requestedNftId: bigint,
    counterparty: string | null,
    deadline: bigint
  ) {
    if (this.paused) return { error: 106 };
    if (deadline <= BigInt(blockHeight) + 10n) return { error: 109 };
    if (counterparty === "SP000000000000000000002Q6VF78") return { error: 108 };
    // Initialize NFT contracts
    if (!this.nftContracts.has(offeredNftContractAddr)) {
      this.nftContracts.set(offeredNftContractAddr, createMockNft());
    }
    const offeredNft = this.nftContracts.get(offeredNftContractAddr)!;
    const ownerRes = offeredNft.getOwner(offeredNftId);
    if ("error" in ownerRes || ownerRes.value !== caller) return { error: 101 };
    // Transfer to contract (escrow)
    const transferRes = offeredNft.transfer(offeredNftId, caller, "contract");
    if ("error" in transferRes) return { error: 113 };
    // Create swap
    const swapId = this.swapCounter;
    this.swaps.set(swapId, {
      offerer: caller,
      offeredNftContract: offeredNftContractAddr,
      offeredNftId,
      requestedNftContract: requestedNftContractAddr,
      requestedNftId,
      counterparty,
      deadline,
      accepted: false,
      cancelled: false,
      completed: false,
    });
    this.swapCounter += 1n;
    const history = this.userSwapHistory.get(caller) || [];
    history.push(swapId);
    this.userSwapHistory.set(caller, history);
    return { value: swapId };
  },

  acceptSwap(caller: string, swapId: bigint, requestedNftContractAddr: string) {
    if (this.paused) return { error: 106 };
    const swap = this.swaps.get(swapId);
    if (!swap) return { error: 102 };
    if (swap.accepted) return { error: 111 };
    if (swap.cancelled) return { error: 105 };
    if (swap.completed) return { error: 104 };
    if (BigInt(blockHeight) >= swap.deadline) return { error: 103 };
    if (swap.counterparty && swap.counterparty !== caller) return { error: 112 };
    if (requestedNftContractAddr !== swap.requestedNftContract) return { error: 107 };
    const requestedNft = this.nftContracts.get(requestedNftContractAddr) || createMockNft();
    const ownerRes = requestedNft.getOwner(swap.requestedNftId);
    if ("error" in ownerRes || ownerRes.value !== caller) return { error: 101 };
    // Transfer requested NFT to contract
    const transferReq = requestedNft.transfer(swap.requestedNftId, caller, "contract");
    if ("error" in transferReq) return { error: 113 };
    // Perform swap
    const offeredNft = this.nftContracts.get(swap.offeredNftContract)!;
    offeredNft.transfer(swap.offeredNftId, "contract", caller);
    requestedNft.transfer(swap.requestedNftId, "contract", swap.offerer);
    // Update swap
    swap.accepted = true;
    swap.completed = true;
    this.swaps.set(swapId, swap);
    const history = this.userSwapHistory.get(caller) || [];
    history.push(swapId);
    this.userSwapHistory.set(caller, history);
    return { value: true };
  },

  cancelSwap(caller: string, swapId: bigint, offeredNftContractAddr: string) {
    if (this.paused) return { error: 106 };
    const swap = this.swaps.get(swapId);
    if (!swap) return { error: 102 };
    if (swap.offerer !== caller) return { error: 100 };
    if (swap.accepted) return { error: 111 };
    if (swap.completed) return { error: 104 };
    if (swap.cancelled) return { error: 105 };
    if (offeredNftContractAddr !== swap.offeredNftContract) return { error: 107 };
    const offeredNft = this.nftContracts.get(offeredNftContractAddr)!;
    const transferRes = offeredNft.transfer(swap.offeredNftId, "contract", caller);
    if ("error" in transferRes) return { error: 113 };
    swap.cancelled = true;
    this.swaps.set(swapId, swap);
    return { value: true };
  },

  getSwap(swapId: bigint) {
    return this.swaps.get(swapId);
  },

  getUserHistory(user: string) {
    return this.userSwapHistory.get(user) || [];
  },
};

// Mock block height
let blockHeight = 0;

describe("SeedVault Seed Swap Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.treasury = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.swapCounter = 0n;
    mockContract.swaps = new Map();
    mockContract.userSwapHistory = new Map();
    mockContract.nftContracts = new Map();
    blockHeight = 0;
  });

  it("should create a swap offer", () => {
    const offeredAddr = "NFT1";
    const requestedAddr = "NFT2";
    const offerer = "ST2CY5V39NHDP5P0TP2KS2SC3H2TT6TZJC6P9BGKG";
    const nft1 = createMockNft();
    nft1.owners.set(1n, offerer);
    mockContract.nftContracts.set(offeredAddr, nft1);
    const result = mockContract.createSwapOffer(offerer, offeredAddr, 1n, requestedAddr, 2n, null, 100n);
    expect(result).toEqual({ value: 0n });
    const swap = mockContract.getSwap(0n);
    expect(swap?.offerer).toBe(offerer);
    expect(swap?.offeredNftId).toBe(1n);
    expect(nft1.getOwner(1n).value).toBe("contract");
    expect(mockContract.getUserHistory(offerer)).toEqual([0n]);
  });

  it("should prevent creating swap with invalid deadline", () => {
    const result = mockContract.createSwapOffer("ST2CY5...", "NFT1", 1n, "NFT2", 2n, null, 5n);
    expect(result).toEqual({ error: 109 });
  });

  it("should prevent creating swap with zero address counterparty", () => {
    const result = mockContract.createSwapOffer(
      "ST2CY5...",
      "NFT1",
      1n,
      "NFT2",
      2n,
      "SP000000000000000000002Q6VF78",
      100n
    );
    expect(result).toEqual({ error: 108 });
  });

  it("should accept an open swap", () => {
    const offeredAddr = "NFT1";
    const requestedAddr = "NFT2";
    const offerer = "ST2CY5V39NHDP5P0TP2KS2SC3H2TT6TZJC6P9BGKG";
    const acceptor = "ST3NBRSFKX28FQ2ZJ1MAKX58FC1P385KXYBPBF9ER";
    const nft1 = createMockNft();
    nft1.owners.set(1n, offerer);
    mockContract.nftContracts.set(offeredAddr, nft1);
    const nft2 = createMockNft();
    nft2.owners.set(2n, acceptor);
    mockContract.nftContracts.set(requestedAddr, nft2);
    mockContract.createSwapOffer(offerer, offeredAddr, 1n, requestedAddr, 2n, null, 100n);
    const result = mockContract.acceptSwap(acceptor, 0n, requestedAddr);
    expect(result).toEqual({ value: true });
    expect(nft1.getOwner(1n).value).toBe(acceptor);
    expect(nft2.getOwner(2n).value).toBe(offerer);
    const swap = mockContract.getSwap(0n);
    expect(swap?.completed).toBe(true);
    expect(mockContract.getUserHistory(acceptor)).toEqual([0n]);
  });

  it("should accept a specific counterparty swap", () => {
    const offeredAddr = "NFT1";
    const requestedAddr = "NFT2";
    const offerer = "ST2CY5...";
    const acceptor = "ST3NB...";
    const nft1 = createMockNft();
    nft1.owners.set(1n, offerer);
    mockContract.nftContracts.set(offeredAddr, nft1);
    const nft2 = createMockNft();
    nft2.owners.set(2n, acceptor);
    mockContract.nftContracts.set(requestedAddr, nft2);
    mockContract.createSwapOffer(offerer, offeredAddr, 1n, requestedAddr, 2n, acceptor, 100n);
    const result = mockContract.acceptSwap(acceptor, 0n, requestedAddr);
    expect(result).toEqual({ value: true });
    expect(nft1.getOwner(1n).value).toBe(acceptor);
    expect(nft2.getOwner(2n).value).toBe(offerer);
  });

  it("should cancel a swap", () => {
    const offeredAddr = "NFT1";
    const requestedAddr = "NFT2";
    const offerer = "ST2CY5...";
    const nft1 = createMockNft();
    nft1.owners.set(1n, offerer);
    mockContract.nftContracts.set(offeredAddr, nft1);
    mockContract.createSwapOffer(offerer, offeredAddr, 1n, requestedAddr, 2n, null, 100n);
    const result = mockContract.cancelSwap(offerer, 0n, offeredAddr);
    expect(result).toEqual({ value: true });
    expect(nft1.getOwner(1n).value).toBe(offerer);
    const swap = mockContract.getSwap(0n);
    expect(swap?.cancelled).toBe(true);
  });


  it("should prevent actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.createSwapOffer("ST2CY5...", "NFT1", 1n, "NFT2", 2n, null, 100n);
    expect(result).toEqual({ error: 106 });
  });

  it("should prevent accepting expired swap", () => {
    const offeredAddr = "NFT1";
    const requestedAddr = "NFT2";
    const offerer = "ST2CY5...";
    const acceptor = "ST3NB...";
    const nft1 = createMockNft();
    nft1.owners.set(1n, offerer);
    mockContract.nftContracts.set(offeredAddr, nft1);
    const nft2 = createMockNft();
    nft2.owners.set(2n, acceptor);
    mockContract.nftContracts.set(requestedAddr, nft2);
    mockContract.createSwapOffer(offerer, offeredAddr, 1n, requestedAddr, 2n, null, 100n);
    blockHeight = 101;
    const result = mockContract.acceptSwap(acceptor, 0n, requestedAddr);
    expect(result).toEqual({ error: 103 });
  });

  it("should prevent accepting with wrong NFT contract", () => {
    const offeredAddr = "NFT1";
    const requestedAddr = "NFT2";
    const wrongAddr = "NFT3";
    const offerer = "ST2CY5...";
    const acceptor = "ST3NB...";
    const nft1 = createMockNft();
    nft1.owners.set(1n, offerer);
    mockContract.nftContracts.set(offeredAddr, nft1);
    const nft2 = createMockNft();
    nft2.owners.set(2n, acceptor);
    mockContract.nftContracts.set(requestedAddr, nft2);
    mockContract.createSwapOffer(offerer, offeredAddr, 1n, requestedAddr, 2n, null, 100n);
    const result = mockContract.acceptSwap(acceptor, 0n, wrongAddr);
    expect(result).toEqual({ error: 107 });
  });
});