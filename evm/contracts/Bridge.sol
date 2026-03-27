// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
/**
 * @title Bridge (Native Token Version)
 * @notice Locks native SCAI on the SCAI chain and emits events for the
 *         off-chain relayer. The relayer mints wSCAI on Solana.
 *         On return path, relayer calls unlockNative() after a Solana burn.
 *
 * @dev No IERC20 needed — native token is sent as msg.value.
 *      No approve() step required from the user.
 */
contract Bridge is Ownable {

    // ── State ────────────────────────────────────────────────────────────────

    address public relayerSigner;       // only address allowed to call unlockTokens
    uint256 public bridgeFee;           // flat fee deducted from every lock
    bool    public paused;

    /// @dev Replay protection — no database needed; on-chain state is the truth.
    mapping(bytes32 => bool) public processedOrders;

    // ── Events ────────────────────────────────────────────────────────────────

    /**
     * @dev Every field is included so the relayer never needs an extra RPC call.
     * @param orderId          Unique hash identifying this bridge order.
     * @param sender           EVM address that locked the tokens.
     * @param solanaRecipient  Recipient's Solana pubkey encoded as bytes32.
     * @param amount           Net amount after bridge fee.
     * @param fee              Fee collected by the bridge.
     * @param timestamp        block.timestamp at lock time (used for event expiry).
     */
    event coinsLocked(
        bytes32 indexed orderId,
        address indexed sender,
        bytes32         solanaRecipient,
        uint256         amount,
        uint256         fee,
        uint256         timestamp
    );

    /**
     * @dev Emitted when the relayer releases tokens back to an EVM recipient.
     */
    event coinsUnlocked(
        bytes32 indexed orderId,
        address indexed recipient,
        uint256         amount
    );

    event RelayerSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event BridgeFeeUpdated(uint256 oldFee, uint256 newFee);
    event PausedUpdated(bool paused);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
    
        address _relayerSigner,
        uint256 _bridgeFee
    ) Ownable(msg.sender) {
        require(_relayerSigner  != address(0), "Zero relayer address");

        relayerSigner = _relayerSigner;
        bridgeFee     = _bridgeFee;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier notPaused() {
        require(!paused, "Bridge: paused");
        _;
    }

    // ── User-facing ───────────────────────────────────────────────────────────

    /**
     * @notice Lock native SCAI tokens in this contract.
     *         The relayer will mint an equivalent amount of wSCAI on Solana
     *         to `solanaRecipient` after deducting the bridge fee.
     *
     
     * @param solanaRecipient  Destination Solana pubkey encoded as bytes32.
     *                         Off-chain: `Buffer.from(publicKey.toBytes())`.
     */
    function lockCoins(
        bytes32 solanaRecipient
    ) external payable notPaused {
        require(msg.value > bridgeFee,       "Bridge: amount <= fee");
        require(solanaRecipient != 0,     "Bridge: zero solana recipient");


        uint256 netAmount = msg.value - bridgeFee;

        // Deterministic orderId — uniqueness within same block ensured by block.number.
        bytes32 orderId = keccak256(abi.encodePacked(
            msg.sender,
            solanaRecipient,
            netAmount,
            block.timestamp,
            block.number
        ));

        emit coinsLocked(
            orderId,
            msg.sender,
            solanaRecipient,
            netAmount,
            bridgeFee,
            block.timestamp
        );
    }

    // ── Relayer-facing ────────────────────────────────────────────────────────

    /**
     * @notice Release locked native SCAI to `recipient`.
     *         Only callable by the authorised relayer signer.
     *         `orderId` must match the burnId emitted on Solana.
     */
    function unlockCoins(
        bytes32 orderId,
        address payable recipient,
        uint256 amount
    ) external notPaused {
        require(msg.sender == relayerSigner,  "Bridge: not relayer");
        require(!processedOrders[orderId],    "Bridge: already processed");
        require(recipient != address(0),      "Bridge: zero recipient");
        require(amount > 0,                   "Bridge: zero amount");
        require(address(this).balance>=amount,"Bridge:insufficient balance");

        processedOrders[orderId] = true;

        (bool successs,)=recipient.call{value:amount}("");
        require(successs,"Bridge,transfer failed");

        emit coinsUnlocked(orderId, recipient, amount);
    }

    //─── Receive native token ───────────────────────────────────────────────────
     
     /// @dev Allows contract to receive native SCAI directly if needed.
     receive() external payable {}

    // ── Owner controls ────────────────────────────────────────────────────────

    function setRelayerSigner(address signer) external onlyOwner {
        require(signer != address(0), "Bridge: zero address");
        emit RelayerSignerUpdated(relayerSigner, signer);
        relayerSigner = signer;
    }

    function setBridgeFee(uint256 fee) external onlyOwner {
        emit BridgeFeeUpdated(bridgeFee, fee);
        bridgeFee = fee;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedUpdated(_paused);
    }

    /**
     * @notice Withdraw all SCAI tokens to owner in an emergency.
     *         Should be used only when bridge is already paused.
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Bridge: nothing to withdraw");
          (bool success, ) = payable(owner()).call{value: balance}("");
          require(success,"Bridge:withdraw failed");
        emit EmergencyWithdraw(owner(), balance);
    }

    ///@notice how much native SCAI is locked in this contract 
function lockedBalance() external view returns (uint256){
    return address(this).balance;
}
}