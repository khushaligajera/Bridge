use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Burn};
use sha2::{Sha256, Digest};

declare_id!("HEWS6f9LPcuZJtKi7NZ3jbaZk6JRF58Wzc89WgnY7bSJ");

const ADAPTER_STATE_SEED:     &[u8] = b"adapter_state";
const ADAPTER_AUTHORITY_SEED: &[u8] = b"adapter_authority";
const ORDER_RECORD_SEED:      &[u8] = b"order_record";
const BURN_ORDER_SEED:        &[u8] = b"burn_order";

#[program]
pub mod bridge_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, relayer_pubkey: Pubkey) -> Result<()> {
        let state        = &mut ctx.accounts.adapter_state;
        state.owner      = ctx.accounts.owner.key();
        state.relayer    = relayer_pubkey;
        state.wscai_mint = ctx.accounts.wscai_mint.key();
        state.paused     = false;
        state.bump       = ctx.bumps.adapter_state;
        state.auth_bump  = ctx.bumps.adapter_authority;
        emit!(BridgeInitialized {
            owner:   state.owner,
            relayer: state.relayer,
            mint:    state.wscai_mint,
        });
        Ok(())
    }

    pub fn execute_mint(ctx: Context<ExecuteMint>, order_id: [u8; 32], amount: u64) -> Result<()> {
        require!(!ctx.accounts.adapter_state.paused, BridgeError::Paused);
        require!(amount > 0, BridgeError::ZeroAmount);

        let record      = &mut ctx.accounts.order_record;
        record.order_id = order_id;
        record.bump     = ctx.bumps.order_record;

        let auth_bump        = ctx.accounts.adapter_state.auth_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[ADAPTER_AUTHORITY_SEED, &[auth_bump]]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint:      ctx.accounts.wscai_mint.to_account_info(),
                    to:        ctx.accounts.recipient_ata.to_account_info(),
                    authority: ctx.accounts.adapter_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let recipient = ctx.accounts.recipient_ata.owner;
        emit!(MintCompleted { order_id, recipient, amount });
        Ok(())
    }

    pub fn initiate_burn(ctx: Context<InitiateBurn>, evm_recipient: [u8; 20], amount: u64,slot:u64) -> Result<()> {
        require!(!ctx.accounts.adapter_state.paused, BridgeError::Paused);
        require!(amount > 0, BridgeError::ZeroAmount);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint:      ctx.accounts.wscai_mint.to_account_info(),
                    from:      ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        let clock   = Clock::get()?;
        let burn_id = derive_burn_id(
            &ctx.accounts.user.key(),
            &evm_recipient,
            amount,
            clock.unix_timestamp,
            slot,
        );

        let burn_order           = &mut ctx.accounts.burn_order;
        burn_order.burn_id       = burn_id;
        burn_order.evm_recipient = evm_recipient;
        burn_order.amount        = amount;
        burn_order.timestamp     = clock.unix_timestamp;
        burn_order.bump          = ctx.bumps.burn_order;

        emit!(BurnInitiated { burn_id, evm_recipient, amount, timestamp: clock.unix_timestamp });
        Ok(())
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.adapter_state.paused = paused;
        emit!(PausedUpdated { paused });
        Ok(())
    }

    pub fn set_relayer(ctx: Context<SetRelayer>, new_relayer: Pubkey) -> Result<()> {
        ctx.accounts.adapter_state.relayer = new_relayer;
        emit!(RelayerUpdated { relayer: new_relayer });
        Ok(())
    }
}

// ── Account Contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer  = owner,
        space  = AdapterState::SIZE,
        seeds  = [ADAPTER_STATE_SEED],
        bump,
    )]
    pub adapter_state: Account<'info, AdapterState>,

    /// CHECK: PDA that holds mint authority — no data, just a signer.
    #[account(seeds = [ADAPTER_AUTHORITY_SEED], bump)]
    pub adapter_authority: UncheckedAccount<'info>,

    pub wscai_mint:     Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(order_id: [u8; 32])]
pub struct ExecuteMint<'info> {
    #[account(
        mut,
        constraint = relayer.key() == adapter_state.relayer @ BridgeError::NotRelayer
    )]
    pub relayer: Signer<'info>,

    #[account(seeds = [ADAPTER_STATE_SEED], bump = adapter_state.bump)]
    pub adapter_state: Account<'info, AdapterState>,

    /// CHECK: PDA signer for mint authority CPI.
    #[account(seeds = [ADAPTER_AUTHORITY_SEED], bump = adapter_state.auth_bump)]
    pub adapter_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer  = relayer,
        space  = OrderRecord::SIZE,
        seeds  = [ORDER_RECORD_SEED, &order_id],
        bump,
    )]
    pub order_record: Account<'info, OrderRecord>,

    #[account(
        mut,
        constraint = wscai_mint.key() == adapter_state.wscai_mint @ BridgeError::WrongMint
    )]
    pub wscai_mint: Account<'info, Mint>,

    #[account(mut)]
    pub recipient_ata:  Account<'info, TokenAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(evm_recipient: [u8; 20], amount: u64, slot: u64)]
pub struct InitiateBurn<'info> {
    #[account(mut)]
    pub user: Signer<'info>, Reload Workspace



    #[account(seeds = [ADAPTER_STATE_SEED], bump = adapter_state.bump)]
    pub adapter_state: Account<'info, AdapterState>,

    #[account(
        mut,
        constraint = wscai_mint.key() == adapter_state.wscai_mint @ BridgeError::WrongMint
    )]
    pub wscai_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_ata.owner == user.key() @ BridgeError::WrongOwner
    )]
    pub user_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        space = BurnOrder::SIZE,
        seeds = [BURN_ORDER_SEED, user.key().as_ref(), &slot.to_le_bytes()],
        bump,
    )]
    pub burn_order:     Account<'info, BurnOrder>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(constraint = owner.key() == adapter_state.owner @ BridgeError::NotOwner)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [ADAPTER_STATE_SEED], bump = adapter_state.bump)]
    pub adapter_state: Account<'info, AdapterState>,
}

#[derive(Accounts)]
pub struct SetRelayer<'info> {
    #[account(constraint = owner.key() == adapter_state.owner @ BridgeError::NotOwner)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [ADAPTER_STATE_SEED], bump = adapter_state.bump)]
    pub adapter_state: Account<'info, AdapterState>,
}

// ── State Accounts ────────────────────────────────────────────────────────────

#[account]
pub struct AdapterState {
    pub owner:      Pubkey,
    pub relayer:    Pubkey,
    pub wscai_mint: Pubkey,
    pub paused:     bool,
    pub bump:       u8,
    pub auth_bump:  u8,
}
impl AdapterState {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 1 + 1 + 1 + 32;
}

#[account]
pub struct OrderRecord {
    pub order_id: [u8; 32],
    pub bump:     u8,
}
impl OrderRecord {
    pub const SIZE: usize = 8 + 32 + 1 + 7;
}

#[account]
pub struct BurnOrder {
    pub burn_id:       [u8; 32],
    pub evm_recipient: [u8; 20],
    pub amount:        u64,
    pub timestamp:     i64,
    pub bump:          u8,
}
impl BurnOrder {
    pub const SIZE: usize = 8 + 32 + 20 + 8 + 8 + 1 + 3;
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct BridgeInitialized {
    pub owner:   Pubkey,
    pub relayer: Pubkey,
    pub mint:    Pubkey,
}

#[event]
pub struct MintCompleted {
    pub order_id:  [u8; 32],
    pub recipient: Pubkey,
    pub amount:    u64,
}

#[event]
pub struct BurnInitiated {
    pub burn_id:       [u8; 32],
    pub evm_recipient: [u8; 20],
    pub amount:        u64,
    pub timestamp:     i64,
}

#[event] pub struct PausedUpdated  { pub paused:  bool   }
#[event] pub struct RelayerUpdated { pub relayer: Pubkey }

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum BridgeError {
    #[msg("Bridge is paused")]               Paused,
    #[msg("Not the authorised relayer")]     NotRelayer,
    #[msg("Not the program owner")]          NotOwner,
    #[msg("Amount must be greater than 0")]  ZeroAmount,
    #[msg("Wrong wSCAI mint account")]       WrongMint,
    #[msg("Token account owner mismatch")]   WrongOwner,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn derive_burn_id(
    user:          &Pubkey,
    evm_recipient: &[u8; 20],
    amount:        u64,
    timestamp:     i64,
    slot:          u64,
) -> [u8; 32] {
    let mut data = [0u8; 76];
    data[0..32].copy_from_slice(user.as_ref());
    data[32..52].copy_from_slice(evm_recipient);
    data[52..60].copy_from_slice(&amount.to_le_bytes());
    data[60..68].copy_from_slice(&timestamp.to_le_bytes());
    data[68..76].copy_from_slice(&slot.to_le_bytes());

      let mut hasher = Sha256::new();
    hasher.update(&data);
    hasher.finalize().into()
}