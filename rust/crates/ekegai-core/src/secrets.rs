//! Secret storage.
//!
//! The TypeScript original kept `apiKey` inline in `AgentConfig` and its
//! `serialize()` spread the whole object, so every workflow save wrote the key
//! in cleartext to a user-chosen file. We keep only an opaque `secret_ref` in
//! the session and put the actual material behind the OS keyring.
//!
//! If the keyring is unavailable we deliberately *fail* rather than silently
//! falling back to a plaintext file.

use anyhow::Result;

/// A handle to a stored secret. The value itself never enters `SessionState`.
pub fn secret_ref(provider: &str, account: &str) -> String {
    format!("ekegai/{provider}/{account}")
}

#[cfg(feature = "keyring")]
pub fn store(reference: &str, secret: &str) -> Result<()> {
    let entry = keyring::Entry::new("ekegai", reference)
        .map_err(anyhow::Error::from)?;
    entry
        .set_password(secret)
        .map_err(anyhow::Error::from)
}

#[cfg(feature = "keyring")]
pub fn load(reference: &str) -> Result<String> {
    let entry = keyring::Entry::new("ekegai", reference)
        .map_err(anyhow::Error::from)?;
    entry.get_password().map_err(anyhow::Error::from)
}

#[cfg(feature = "keyring")]
pub fn delete(reference: &str) -> Result<()> {
    let entry = keyring::Entry::new("ekegai", reference)
        .map_err(anyhow::Error::from)?;
    entry.delete_credential().map_err(anyhow::Error::from)
}

#[cfg(not(feature = "keyring"))]
pub fn store(_reference: &str, _secret: &str) -> Result<()> {
    anyhow::bail!(
        "ekegai was built without the `keyring` feature, so API keys cannot be \
         stored securely. Rebuild with --features keyring rather than falling \
         back to plaintext."
    )
}

#[cfg(not(feature = "keyring"))]
pub fn load(_reference: &str) -> Result<String> {
    anyhow::bail!(
        "ekegai was built without the `keyring` feature, so API keys cannot be \
         read. Rebuild with --features keyring."
    )
}

#[cfg(not(feature = "keyring"))]
pub fn delete(_reference: &str) -> Result<()> {
    anyhow::bail!("ekegai was built without the `keyring` feature.")
}
