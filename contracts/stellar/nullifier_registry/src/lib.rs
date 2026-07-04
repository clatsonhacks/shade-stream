#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env};

#[contracttype]
enum DataKey {
    Admin,
    Paused,
    Spent(BytesN<32>),
    Authorized(Address), // #allowed-spender registry
}

#[contract]
pub struct NullifierRegistry;

#[contractimpl]
impl NullifierRegistry {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Admin grants/revokes a contract (e.g. ShadePool, IntentEscrow) the right
    /// to spend nullifiers. Random accounts can never spend.
    pub fn set_authorized_spender(env: Env, spender: Address, allowed: bool) {
        Self::require_admin(&env);
        if allowed {
            env.storage().persistent().set(&DataKey::Authorized(spender), &true);
        } else {
            env.storage().persistent().remove(&DataKey::Authorized(spender));
        }
    }

    pub fn is_authorized(env: Env, spender: Address) -> bool {
        env.storage().persistent().get(&DataKey::Authorized(spender)).unwrap_or(false)
    }

    /// Spend a nullifier exactly once. Only an authorized spender contract may
    /// call this, and it must authorize the call (caller.require_auth).
    pub fn spend(env: Env, caller: Address, nullifier: BytesN<32>) -> bool {
        Self::require_not_paused(&env);
        caller.require_auth();
        if !env.storage().persistent().get(&DataKey::Authorized(caller.clone())).unwrap_or(false) {
            panic!("unauthorized spender");
        }
        if Self::is_spent(env.clone(), nullifier.clone()) {
            panic!("nullifier spent");
        }
        env.storage().persistent().set(&DataKey::Spent(nullifier.clone()), &true);
        env.events().publish((symbol_short!("spend"), caller), nullifier);
        true
    }

    pub fn is_spent(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().get(&DataKey::Spent(nullifier)).unwrap_or(false)
    }

    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &true);
    }

    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic!("paused");
        }
    }
}
