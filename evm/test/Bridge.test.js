const { expect } = require("chai");
const { ethers }  = require("hardhat");

describe("Bridge", function () {
  let bridge, token, owner, relayer, user, other;

  const FEE    = ethers.parseEther("1");
  const AMOUNT = ethers.parseEther("100");
  const SOLANA = ethers.encodeBytes32String("SolanaPublicKeyHere11111111111"); // 32 bytes

  beforeEach(async () => {
    [owner, relayer, user, other] = await ethers.getSigners();

    // Deploy a minimal ERC-20 mock
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy("SCAI", "SCAI", ethers.parseEther("1000000"));

    // Fund user
    await token.transfer(user.address, ethers.parseEther("1000"));

    const Bridge = await ethers.getContractFactory("Bridge");
    bridge = await Bridge.deploy(
      await token.getAddress(),
      relayer.address,
      FEE
    );
  });

  // ── lockTokens ────────────────────────────────────────────────────────────

  describe("lockTokens", () => {
    it("transfers tokens and emits TokensLocked", async () => {
      await token.connect(user).approve(await bridge.getAddress(), AMOUNT);

      await expect(bridge.connect(user).lockTokens(AMOUNT, SOLANA))
        .to.emit(bridge, "TokensLocked")
        .withArgs(
          (v) => v !== ethers.ZeroHash,   // orderId generated
          user.address,
          SOLANA,
          AMOUNT - FEE,
          FEE,
          (v) => v > 0n
        );

      expect(await token.balanceOf(await bridge.getAddress())).to.equal(AMOUNT);
    });

    it("reverts when amount <= fee", async () => {
      await token.connect(user).approve(await bridge.getAddress(), FEE);
      await expect(
        bridge.connect(user).lockTokens(FEE, SOLANA)
      ).to.be.revertedWith("Bridge: amount <= fee");
    });

    it("reverts when paused", async () => {
      await bridge.setPaused(true);
      await token.connect(user).approve(await bridge.getAddress(), AMOUNT);
      await expect(
        bridge.connect(user).lockTokens(AMOUNT, SOLANA)
      ).to.be.revertedWith("Bridge: paused");
    });

    it("reverts when solanaRecipient is zero", async () => {
      await token.connect(user).approve(await bridge.getAddress(), AMOUNT);
      await expect(
        bridge.connect(user).lockTokens(AMOUNT, ethers.ZeroHash)
      ).to.be.revertedWith("Bridge: zero solana recipient");
    });
  });

  // ── unlockTokens ──────────────────────────────────────────────────────────

  describe("unlockTokens", () => {
    let orderId;

    beforeEach(async () => {
      // Seed bridge with tokens
      await token.transfer(await bridge.getAddress(), AMOUNT);
      orderId = ethers.keccak256(ethers.toUtf8Bytes("test-order-1"));
    });

    it("releases tokens and emits TokensUnlocked", async () => {
      await expect(
        bridge.connect(relayer).unlockTokens(orderId, user.address, AMOUNT)
      )
        .to.emit(bridge, "TokensUnlocked")
        .withArgs(orderId, user.address, AMOUNT);

      expect(await token.balanceOf(user.address)).to.equal(
        ethers.parseEther("1000") + AMOUNT
      );
    });

    it("reverts on duplicate orderId", async () => {
      await bridge.connect(relayer).unlockTokens(orderId, user.address, AMOUNT);
      await expect(
        bridge.connect(relayer).unlockTokens(orderId, user.address, AMOUNT)
      ).to.be.revertedWith("Bridge: already processed");
    });

    it("reverts when caller is not relayer", async () => {
      await expect(
        bridge.connect(other).unlockTokens(orderId, user.address, AMOUNT)
      ).to.be.revertedWith("Bridge: not relayer");
    });
  });

  // ── Owner controls ────────────────────────────────────────────────────────

  describe("owner controls", () => {
    it("owner can update relayer signer", async () => {
      await bridge.setRelayerSigner(other.address);
      expect(await bridge.relayerSigner()).to.equal(other.address);
    });

    it("owner can update fee", async () => {
      await bridge.setBridgeFee(ethers.parseEther("2"));
      expect(await bridge.bridgeFee()).to.equal(ethers.parseEther("2"));
    });

    it("non-owner cannot pause", async () => {
      await expect(bridge.connect(user).setPaused(true)).to.be.reverted;
    });

    it("emergency withdraw sends all tokens to owner", async () => {
      await token.transfer(await bridge.getAddress(), AMOUNT);
      const before = await token.balanceOf(owner.address);
      await bridge.emergencyWithdraw();
      expect(await token.balanceOf(owner.address)).to.equal(before + AMOUNT);
    });
  });
});