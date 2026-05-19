//! Database repository functions

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::error::DbError;
use crate::models::*;
use crate::pool::DbPool;

/// Repository for provider operations
pub struct ProviderRepo;

impl ProviderRepo {
    /// Get all enabled providers
    pub async fn get_all(pool: &DbPool) -> Result<Vec<Provider>, DbError> {
        let providers = sqlx::query_as::<_, Provider>(
            "SELECT * FROM providers WHERE is_enabled = true ORDER BY name",
        )
        .fetch_all(pool)
        .await?;

        Ok(providers)
    }

    /// Get provider by name
    pub async fn get_by_name(pool: &DbPool, name: &str) -> Result<Option<Provider>, DbError> {
        let provider = sqlx::query_as::<_, Provider>("SELECT * FROM providers WHERE name = $1")
            .bind(name)
            .fetch_optional(pool)
            .await?;

        Ok(provider)
    }
}

/// Repository for model pricing operations
pub struct ModelPricingRepo;

impl ModelPricingRepo {
    /// Get current pricing for a model
    pub async fn get_by_model_id(
        pool: &DbPool,
        model_id: &str,
    ) -> Result<Option<ModelPricing>, DbError> {
        // Use raw query due to Decimal type
        let row = sqlx::query(
            r#"
            SELECT
                mp.id, mp.provider_id, mp.model_id, mp.model_name,
                mp.input_per_million::float8, mp.output_per_million::float8,
                mp.cached_input_per_million::float8, mp.reasoning_per_million::float8,
                mp.context_window, mp.max_output_tokens, mp.is_enabled,
                mp.effective_from, mp.effective_until, mp.created_at, mp.updated_at
            FROM model_pricing mp
            WHERE mp.model_id = $1
                AND mp.is_enabled = true
                AND mp.effective_from <= NOW()
                AND (mp.effective_until IS NULL OR mp.effective_until > NOW())
            ORDER BY mp.effective_from DESC
            LIMIT 1
            "#,
        )
        .bind(model_id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| ModelPricing {
            id: r.get("id"),
            provider_id: r.get("provider_id"),
            model_id: r.get("model_id"),
            model_name: r.get("model_name"),
            input_per_million: r.get("input_per_million"),
            output_per_million: r.get("output_per_million"),
            cached_input_per_million: r.get("cached_input_per_million"),
            reasoning_per_million: r.get("reasoning_per_million"),
            context_window: r.get("context_window"),
            max_output_tokens: r.get("max_output_tokens"),
            is_enabled: r.get("is_enabled"),
            effective_from: r.get("effective_from"),
            effective_until: r.get("effective_until"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        }))
    }

    /// Get all current pricing
    pub async fn get_all_current(pool: &DbPool) -> Result<Vec<ModelPricingSimple>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT ON (mp.model_id)
                mp.model_id, mp.model_name, p.name as provider_name,
                mp.input_per_million::float8, mp.output_per_million::float8,
                mp.cached_input_per_million::float8,
                mp.context_window, mp.max_output_tokens
            FROM model_pricing mp
            JOIN providers p ON mp.provider_id = p.id
            WHERE mp.is_enabled = true
                AND p.is_enabled = true
                AND mp.effective_from <= NOW()
                AND (mp.effective_until IS NULL OR mp.effective_until > NOW())
            ORDER BY mp.model_id, mp.effective_from DESC
            "#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ModelPricingSimple {
                model_id: r.get("model_id"),
                model_name: r.get("model_name"),
                provider_name: r.get("provider_name"),
                input_per_million: r.get("input_per_million"),
                output_per_million: r.get("output_per_million"),
                cached_input_per_million: r.get("cached_input_per_million"),
                context_window: r.get("context_window"),
                max_output_tokens: r.get("max_output_tokens"),
            })
            .collect())
    }

    /// Get pricing for a provider
    pub async fn get_by_provider(
        pool: &DbPool,
        provider_name: &str,
    ) -> Result<Vec<ModelPricingSimple>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT ON (mp.model_id)
                mp.model_id, mp.model_name, p.name as provider_name,
                mp.input_per_million::float8, mp.output_per_million::float8,
                mp.cached_input_per_million::float8,
                mp.context_window, mp.max_output_tokens
            FROM model_pricing mp
            JOIN providers p ON mp.provider_id = p.id
            WHERE p.name = $1
                AND mp.is_enabled = true
                AND p.is_enabled = true
                AND mp.effective_from <= NOW()
                AND (mp.effective_until IS NULL OR mp.effective_until > NOW())
            ORDER BY mp.model_id, mp.effective_from DESC
            "#,
        )
        .bind(provider_name)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ModelPricingSimple {
                model_id: r.get("model_id"),
                model_name: r.get("model_name"),
                provider_name: r.get("provider_name"),
                input_per_million: r.get("input_per_million"),
                output_per_million: r.get("output_per_million"),
                cached_input_per_million: r.get("cached_input_per_million"),
                context_window: r.get("context_window"),
                max_output_tokens: r.get("max_output_tokens"),
            })
            .collect())
    }
}

/// Repository for conversation operations
pub struct ConversationRepo;

impl ConversationRepo {
    /// Create a new conversation
    pub async fn create(pool: &DbPool, new: NewConversation) -> Result<Conversation, DbError> {
        let conv = sqlx::query_as::<_, Conversation>(
            r#"
            INSERT INTO conversations (user_id, title, model_id, metadata)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(&new.user_id)
        .bind(&new.title)
        .bind(&new.model_id)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(conv)
    }

    /// Get conversation by ID
    pub async fn get_by_id(pool: &DbPool, id: Uuid) -> Result<Option<Conversation>, DbError> {
        let conv = sqlx::query_as::<_, Conversation>("SELECT * FROM conversations WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(conv)
    }

    /// Get conversations for a user
    pub async fn get_by_user(
        pool: &DbPool,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<Conversation>, DbError> {
        let convs = sqlx::query_as::<_, Conversation>(
            r#"
            SELECT * FROM conversations
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(convs)
    }

    /// Update conversation title
    pub async fn update_title(pool: &DbPool, id: Uuid, title: &str) -> Result<(), DbError> {
        sqlx::query("UPDATE conversations SET title = $2 WHERE id = $1")
            .bind(id)
            .bind(title)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Delete conversation
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM conversations WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Create conversation with auto-generated title from first message
    pub async fn create_with_auto_title(
        pool: &DbPool,
        user_id: Option<String>,
        model_id: String,
        first_message: &str,
    ) -> Result<Conversation, DbError> {
        let title = if first_message.len() > 100 {
            format!("{}...", &first_message[..97])
        } else {
            first_message.to_string()
        };

        let new = NewConversation {
            user_id,
            title: Some(title),
            model_id,
            metadata: None,
        };

        Self::create(pool, new).await
    }
}

/// Repository for message operations
pub struct MessageRepo;

impl MessageRepo {
    /// Create a new message
    pub async fn create(pool: &DbPool, new: NewMessage) -> Result<Message, DbError> {
        let msg = sqlx::query_as::<_, Message>(
            r#"
            INSERT INTO messages (conversation_id, role, content, metadata)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(new.conversation_id)
        .bind(&new.role)
        .bind(&new.content)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(msg)
    }

    /// Get messages for a conversation
    pub async fn get_by_conversation(
        pool: &DbPool,
        conversation_id: Uuid,
    ) -> Result<Vec<Message>, DbError> {
        let msgs = sqlx::query_as::<_, Message>(
            "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
        )
        .bind(conversation_id)
        .fetch_all(pool)
        .await?;

        Ok(msgs)
    }
}

/// Repository for request log operations
pub struct RequestLogRepo;

impl RequestLogRepo {
    /// Create a new request log
    pub async fn create(pool: &DbPool, new: NewRequestLog) -> Result<RequestLog, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO request_logs (
                response_id, conversation_id, provider_name, model_id, user_id,
                input_tokens, output_tokens, cached_tokens, reasoning_tokens,
                cost_usd, latency_ms, status, error_code, error_message, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
            "#,
        )
        .bind(&new.response_id)
        .bind(new.conversation_id)
        .bind(&new.provider_name)
        .bind(&new.model_id)
        .bind(&new.user_id)
        .bind(new.input_tokens)
        .bind(new.output_tokens)
        .bind(new.cached_tokens)
        .bind(new.reasoning_tokens)
        .bind(new.cost_usd)
        .bind(new.latency_ms)
        .bind(&new.status)
        .bind(&new.error_code)
        .bind(&new.error_message)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(RequestLog {
            id: row.get("id"),
            response_id: row.get("response_id"),
            conversation_id: row.get("conversation_id"),
            provider_name: row.get("provider_name"),
            model_id: row.get("model_id"),
            user_id: row.get("user_id"),
            input_tokens: row.get("input_tokens"),
            output_tokens: row.get("output_tokens"),
            cached_tokens: row.get("cached_tokens"),
            reasoning_tokens: row.get("reasoning_tokens"),
            cost_usd: row.get::<Option<f64>, _>("cost_usd"),
            latency_ms: row.get("latency_ms"),
            status: row.get("status"),
            error_code: row.get("error_code"),
            error_message: row.get("error_message"),
            metadata: row.get("metadata"),
            created_at: row.get("created_at"),
        })
    }

    /// Get recent request logs for a user
    pub async fn get_by_user(
        pool: &DbPool,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<RequestLog>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM request_logs
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| RequestLog {
                id: row.get("id"),
                response_id: row.get("response_id"),
                conversation_id: row.get("conversation_id"),
                provider_name: row.get("provider_name"),
                model_id: row.get("model_id"),
                user_id: row.get("user_id"),
                input_tokens: row.get("input_tokens"),
                output_tokens: row.get("output_tokens"),
                cached_tokens: row.get("cached_tokens"),
                reasoning_tokens: row.get("reasoning_tokens"),
                cost_usd: row.get::<Option<f64>, _>("cost_usd"),
                latency_ms: row.get("latency_ms"),
                status: row.get("status"),
                error_code: row.get("error_code"),
                error_message: row.get("error_message"),
                metadata: row.get("metadata"),
                created_at: row.get("created_at"),
            })
            .collect())
    }
}

/// Repository for response operations
pub struct ResponseRepo;

impl ResponseRepo {
    /// Create a new response record
    pub async fn create(pool: &DbPool, new: NewResponse) -> Result<ResponseRecord, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO responses (
                id, conversation_id, model_id, status, previous_response_id,
                input_items, output_items,
                usage_input_tokens, usage_output_tokens, usage_cached_tokens, usage_reasoning_tokens,
                usage_cost_usd, error_code, error_message, incomplete_reason, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
            "#,
        )
        .bind(&new.id)
        .bind(new.conversation_id)
        .bind(&new.model_id)
        .bind(&new.status)
        .bind(&new.previous_response_id)
        .bind(&new.input_items)
        .bind(&new.output_items)
        .bind(new.usage_input_tokens)
        .bind(new.usage_output_tokens)
        .bind(new.usage_cached_tokens)
        .bind(new.usage_reasoning_tokens)
        .bind(new.usage_cost_usd)
        .bind(&new.error_code)
        .bind(&new.error_message)
        .bind(&new.incomplete_reason)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(ResponseRecord {
            id: row.get("id"),
            conversation_id: row.get("conversation_id"),
            model_id: row.get("model_id"),
            status: row.get("status"),
            previous_response_id: row.get("previous_response_id"),
            input_items: row.get("input_items"),
            output_items: row.get("output_items"),
            usage_input_tokens: row.get("usage_input_tokens"),
            usage_output_tokens: row.get("usage_output_tokens"),
            usage_cached_tokens: row.get("usage_cached_tokens"),
            usage_reasoning_tokens: row.get("usage_reasoning_tokens"),
            usage_cost_usd: row.get("usage_cost_usd"),
            error_code: row.get("error_code"),
            error_message: row.get("error_message"),
            incomplete_reason: row.get("incomplete_reason"),
            metadata: row.get("metadata"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }

    /// Find conversation ID by response ID (follows previous_response_id chain)
    pub async fn find_conversation_by_response_id(
        pool: &DbPool,
        response_id: &str,
    ) -> Result<Option<Uuid>, DbError> {
        let row = sqlx::query("SELECT conversation_id FROM responses WHERE id = $1")
            .bind(response_id)
            .fetch_optional(pool)
            .await?;

        Ok(row.map(|r| r.get("conversation_id")))
    }

    /// Get all responses in a conversation (ordered chronologically)
    pub async fn get_by_conversation(
        pool: &DbPool,
        conversation_id: Uuid,
    ) -> Result<Vec<ResponseRecord>, DbError> {
        let rows = sqlx::query(
            "SELECT * FROM responses WHERE conversation_id = $1 ORDER BY created_at ASC",
        )
        .bind(conversation_id)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| ResponseRecord {
                id: r.get("id"),
                conversation_id: r.get("conversation_id"),
                model_id: r.get("model_id"),
                status: r.get("status"),
                previous_response_id: r.get("previous_response_id"),
                input_items: r.get("input_items"),
                output_items: r.get("output_items"),
                usage_input_tokens: r.get("usage_input_tokens"),
                usage_output_tokens: r.get("usage_output_tokens"),
                usage_cached_tokens: r.get("usage_cached_tokens"),
                usage_reasoning_tokens: r.get("usage_reasoning_tokens"),
                usage_cost_usd: r.get("usage_cost_usd"),
                error_code: r.get("error_code"),
                error_message: r.get("error_message"),
                incomplete_reason: r.get("incomplete_reason"),
                metadata: r.get("metadata"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })
            .collect())
    }
}

// ============================================================================
// API Key Repository
// ============================================================================

/// Repository for API key operations
pub struct ApiKeyRepo;

impl ApiKeyRepo {
    /// Create a new API key
    pub async fn create(pool: &DbPool, new: NewApiKey) -> Result<ApiKey, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO api_keys (
                key_id, key_hash, name, description, user_id, organization_id,
                scopes, rate_limit_rpm, monthly_token_limit, daily_message_limit,
                expires_at, allowed_ips, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
            "#,
        )
        .bind(&new.key_id)
        .bind(&new.key_hash)
        .bind(&new.name)
        .bind(&new.description)
        .bind(&new.user_id)
        .bind(new.organization_id)
        .bind(&new.scopes)
        .bind(new.rate_limit_rpm)
        .bind(new.monthly_token_limit)
        .bind(new.daily_message_limit)
        .bind(new.expires_at)
        .bind(&new.allowed_ips)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(Self::row_to_api_key(row))
    }

    /// Find API key by key_id (the public prefix)
    pub async fn find_by_key_id(pool: &DbPool, key_id: &str) -> Result<Option<ApiKey>, DbError> {
        let row = sqlx::query("SELECT * FROM api_keys WHERE key_id = $1")
            .bind(key_id)
            .fetch_optional(pool)
            .await?;

        Ok(row.map(Self::row_to_api_key))
    }

    /// Find API key by ID
    pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<ApiKey>, DbError> {
        let row = sqlx::query("SELECT * FROM api_keys WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(row.map(Self::row_to_api_key))
    }

    /// Get all API keys for a user
    pub async fn get_by_user(pool: &DbPool, user_id: &str) -> Result<Vec<ApiKey>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM api_keys
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_api_key).collect())
    }

    /// Get all API keys for an organization
    pub async fn get_by_organization(
        pool: &DbPool,
        organization_id: Uuid,
    ) -> Result<Vec<ApiKey>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM api_keys
            WHERE organization_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(organization_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_api_key).collect())
    }

    /// Validate an API key and return it if valid
    pub async fn validate(
        pool: &DbPool,
        key_id: &str,
        key_hash: &str,
    ) -> Result<Option<ApiKey>, DbError> {
        let row = sqlx::query(
            r#"
            SELECT * FROM api_keys
            WHERE key_id = $1
              AND key_hash = $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            "#,
        )
        .bind(key_id)
        .bind(key_hash)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Self::row_to_api_key))
    }

    /// Update last_used_at timestamp
    pub async fn update_last_used(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Revoke an API key
    pub async fn revoke(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("UPDATE api_keys SET status = 'revoked' WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Delete an API key
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM api_keys WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Increment token usage for an API key
    pub async fn increment_usage(
        pool: &DbPool,
        id: Uuid,
        input_tokens: i32,
        output_tokens: i32,
    ) -> Result<(), DbError> {
        sqlx::query("SELECT increment_api_key_usage($1, $2, $3)")
            .bind(id)
            .bind(input_tokens)
            .bind(output_tokens)
            .execute(pool)
            .await?;

        Ok(())
    }

    fn row_to_api_key(row: sqlx::postgres::PgRow) -> ApiKey {
        ApiKey {
            id: row.get("id"),
            key_id: row.get("key_id"),
            key_hash: row.get("key_hash"),
            name: row.get("name"),
            description: row.get("description"),
            user_id: row.get("user_id"),
            organization_id: row.get("organization_id"),
            scopes: row.get("scopes"),
            rate_limit_rpm: row.get("rate_limit_rpm"),
            monthly_token_limit: row.get("monthly_token_limit"),
            // try_get + .ok().flatten() so reads from pre-migration-020
            // rows (no column at all) don't blow up — they yield None.
            daily_message_limit: row.try_get("daily_message_limit").ok().flatten(),
            current_month_tokens: row.get("current_month_tokens"),
            usage_reset_month: row.get("usage_reset_month"),
            status: row.get("status"),
            expires_at: row.get("expires_at"),
            last_used_at: row.get("last_used_at"),
            allowed_ips: row.get("allowed_ips"),
            metadata: row.get("metadata"),
            scope_type: row.try_get("scope_type").ok(),
            scope_id: row.try_get("scope_id").ok(),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }
}

/// Repository for API key usage tracking
pub struct ApiKeyUsageRepo;

impl ApiKeyUsageRepo {
    /// Record API key usage
    pub async fn create(pool: &DbPool, new: NewApiKeyUsage) -> Result<ApiKeyUsage, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO api_key_usage (
                api_key_id, request_id, model_id, provider_name,
                input_tokens, output_tokens, cached_tokens, reasoning_tokens, cost_usd,
                end_user_id, end_user_external_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            "#,
        )
        .bind(new.api_key_id)
        .bind(&new.request_id)
        .bind(&new.model_id)
        .bind(&new.provider_name)
        .bind(new.input_tokens)
        .bind(new.output_tokens)
        .bind(new.cached_tokens)
        .bind(new.reasoning_tokens)
        .bind(new.cost_usd)
        .bind(new.end_user_id)
        .bind(&new.end_user_external_id)
        .fetch_one(pool)
        .await?;

        Ok(Self::row_to_usage(row))
    }

    /// Get usage for an API key within a time range
    pub async fn get_by_api_key(
        pool: &DbPool,
        api_key_id: Uuid,
        limit: i64,
    ) -> Result<Vec<ApiKeyUsage>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM api_key_usage
            WHERE api_key_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(api_key_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_usage).collect())
    }

    /// Get usage for a specific end user
    pub async fn get_by_end_user(
        pool: &DbPool,
        end_user_id: Uuid,
        limit: i64,
    ) -> Result<Vec<ApiKeyUsage>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM api_key_usage
            WHERE end_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(end_user_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_usage).collect())
    }

    fn row_to_usage(row: sqlx::postgres::PgRow) -> ApiKeyUsage {
        ApiKeyUsage {
            id: row.get("id"),
            api_key_id: row.get("api_key_id"),
            request_id: row.get("request_id"),
            model_id: row.get("model_id"),
            provider_name: row.get("provider_name"),
            input_tokens: row.get("input_tokens"),
            output_tokens: row.get("output_tokens"),
            cached_tokens: row.get("cached_tokens"),
            reasoning_tokens: row.get("reasoning_tokens"),
            cost_usd: row.get("cost_usd"),
            end_user_id: row.try_get("end_user_id").ok(),
            end_user_external_id: row.try_get("end_user_external_id").ok(),
            created_at: row.get("created_at"),
        }
    }
}

// ============================================================================
// Provider Credentials Repository
// ============================================================================

/// Repository for encrypted provider credentials
pub struct ProviderCredentialRepo;

impl ProviderCredentialRepo {
    /// Store encrypted provider credentials
    pub async fn create(
        pool: &DbPool,
        new: NewProviderCredential,
    ) -> Result<ProviderCredential, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO provider_credentials (
                user_id, organization_id, provider_name,
                encrypted_api_key, wrapped_dek, encryption_params, base_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(&new.user_id)
        .bind(new.organization_id)
        .bind(&new.provider_name)
        .bind(&new.encrypted_api_key)
        .bind(&new.wrapped_dek)
        .bind(&new.encryption_params)
        .bind(&new.base_url)
        .fetch_one(pool)
        .await?;

        Ok(Self::row_to_credential(row))
    }

    /// Get credentials for a user and provider
    pub async fn get_by_user_and_provider(
        pool: &DbPool,
        user_id: &str,
        provider_name: &str,
    ) -> Result<Option<ProviderCredential>, DbError> {
        let row = sqlx::query(
            r#"
            SELECT * FROM provider_credentials
            WHERE user_id = $1 AND provider_name = $2 AND is_active = true
            "#,
        )
        .bind(user_id)
        .bind(provider_name)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Self::row_to_credential))
    }

    /// Get credentials for an organization and provider
    pub async fn get_by_org_and_provider(
        pool: &DbPool,
        organization_id: Uuid,
        provider_name: &str,
    ) -> Result<Option<ProviderCredential>, DbError> {
        let row = sqlx::query(
            r#"
            SELECT * FROM provider_credentials
            WHERE organization_id = $1 AND provider_name = $2 AND is_active = true
            "#,
        )
        .bind(organization_id)
        .bind(provider_name)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Self::row_to_credential))
    }

    /// Get all credentials for a user
    pub async fn get_by_user(
        pool: &DbPool,
        user_id: &str,
    ) -> Result<Vec<ProviderCredential>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM provider_credentials
            WHERE user_id = $1 AND is_active = true
            ORDER BY provider_name
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_credential).collect())
    }

    /// Deactivate credentials
    pub async fn deactivate(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("UPDATE provider_credentials SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Delete credentials
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM provider_credentials WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    fn row_to_credential(row: sqlx::postgres::PgRow) -> ProviderCredential {
        ProviderCredential {
            id: row.get("id"),
            user_id: row.get("user_id"),
            organization_id: row.get("organization_id"),
            provider_name: row.get("provider_name"),
            encrypted_api_key: row.get("encrypted_api_key"),
            wrapped_dek: row.get("wrapped_dek"),
            encryption_params: row.get("encryption_params"),
            base_url: row.get("base_url"),
            is_active: row.get("is_active"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }
}

// ============================================================================
// Organization Repository
// ============================================================================

/// Repository for organization operations
pub struct OrganizationRepo;

impl OrganizationRepo {
    /// Create a new organization
    pub async fn create(pool: &DbPool, new: NewOrganization) -> Result<Organization, DbError> {
        let org = sqlx::query_as::<_, Organization>(
            r#"
            INSERT INTO organizations (name, slug, owner_id, settings)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(&new.name)
        .bind(&new.slug)
        .bind(&new.owner_id)
        .bind(&new.settings)
        .fetch_one(pool)
        .await?;

        Ok(org)
    }

    /// Find organization by ID
    pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<Organization>, DbError> {
        let org = sqlx::query_as::<_, Organization>("SELECT * FROM organizations WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(org)
    }

    /// Find organization by slug
    pub async fn find_by_slug(pool: &DbPool, slug: &str) -> Result<Option<Organization>, DbError> {
        let org = sqlx::query_as::<_, Organization>("SELECT * FROM organizations WHERE slug = $1")
            .bind(slug)
            .fetch_optional(pool)
            .await?;

        Ok(org)
    }

    /// Get organizations for a user
    pub async fn get_by_user(pool: &DbPool, user_id: &str) -> Result<Vec<Organization>, DbError> {
        let orgs = sqlx::query_as::<_, Organization>(
            r#"
            SELECT o.* FROM organizations o
            JOIN organization_members om ON o.id = om.organization_id
            WHERE om.user_id = $1
            ORDER BY o.name
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(orgs)
    }

    /// List all organizations with pagination
    pub async fn list_all(
        pool: &DbPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Organization>, DbError> {
        let orgs = sqlx::query_as::<_, Organization>(
            r#"
            SELECT * FROM organizations
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(orgs)
    }

    /// Update organization
    pub async fn update(
        pool: &DbPool,
        id: Uuid,
        name: Option<&str>,
        settings: Option<&serde_json::Value>,
    ) -> Result<Organization, DbError> {
        let org = sqlx::query_as::<_, Organization>(
            r#"
            UPDATE organizations
            SET name = COALESCE($2, name),
                settings = COALESCE($3, settings),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(settings)
        .fetch_one(pool)
        .await?;

        Ok(org)
    }

    /// Delete organization
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM organizations WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }
}

/// Repository for organization member operations
pub struct OrganizationMemberRepo;

impl OrganizationMemberRepo {
    /// Add a member to an organization
    pub async fn add_member(
        pool: &DbPool,
        new: NewOrganizationMember,
    ) -> Result<OrganizationMember, DbError> {
        let member = sqlx::query_as::<_, OrganizationMember>(
            r#"
            INSERT INTO organization_members (organization_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(new.organization_id)
        .bind(&new.user_id)
        .bind(&new.role)
        .fetch_one(pool)
        .await?;

        Ok(member)
    }

    /// Get members of an organization
    pub async fn get_members(
        pool: &DbPool,
        organization_id: Uuid,
    ) -> Result<Vec<OrganizationMember>, DbError> {
        let members = sqlx::query_as::<_, OrganizationMember>(
            r#"
            SELECT * FROM organization_members
            WHERE organization_id = $1
            ORDER BY joined_at
            "#,
        )
        .bind(organization_id)
        .fetch_all(pool)
        .await?;

        Ok(members)
    }

    /// Check if user is a member of an organization
    pub async fn is_member(
        pool: &DbPool,
        organization_id: Uuid,
        user_id: &str,
    ) -> Result<bool, DbError> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM organization_members
            WHERE organization_id = $1 AND user_id = $2
            "#,
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(count.0 > 0)
    }

    /// Remove a member from an organization
    pub async fn remove_member(
        pool: &DbPool,
        organization_id: Uuid,
        user_id: &str,
    ) -> Result<(), DbError> {
        sqlx::query("DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2")
            .bind(organization_id)
            .bind(user_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Update member role
    pub async fn update_role(
        pool: &DbPool,
        organization_id: Uuid,
        user_id: &str,
        role: &str,
    ) -> Result<(), DbError> {
        sqlx::query(
            "UPDATE organization_members SET role = $3 WHERE organization_id = $1 AND user_id = $2",
        )
        .bind(organization_id)
        .bind(user_id)
        .bind(role)
        .execute(pool)
        .await?;

        Ok(())
    }
}

// ============================================================================
// Team Repository
// ============================================================================

/// Repository for team operations
pub struct TeamRepo;

impl TeamRepo {
    /// Create a new team
    pub async fn create(pool: &DbPool, new: NewTeam) -> Result<Team, DbError> {
        let team = sqlx::query_as::<_, Team>(
            r#"
            INSERT INTO teams (organization_id, name, slug, description, monthly_token_limit, settings)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(new.organization_id)
        .bind(&new.name)
        .bind(&new.slug)
        .bind(&new.description)
        .bind(new.monthly_token_limit)
        .bind(&new.settings)
        .fetch_one(pool)
        .await?;

        Ok(team)
    }

    /// Find team by ID
    pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<Team>, DbError> {
        let team = sqlx::query_as::<_, Team>("SELECT * FROM teams WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(team)
    }

    /// Find team by organization and slug
    pub async fn find_by_org_and_slug(
        pool: &DbPool,
        organization_id: Uuid,
        slug: &str,
    ) -> Result<Option<Team>, DbError> {
        let team = sqlx::query_as::<_, Team>(
            "SELECT * FROM teams WHERE organization_id = $1 AND slug = $2",
        )
        .bind(organization_id)
        .bind(slug)
        .fetch_optional(pool)
        .await?;

        Ok(team)
    }

    /// Get all teams for an organization
    pub async fn get_by_organization(
        pool: &DbPool,
        organization_id: Uuid,
    ) -> Result<Vec<Team>, DbError> {
        let teams = sqlx::query_as::<_, Team>(
            "SELECT * FROM teams WHERE organization_id = $1 ORDER BY name",
        )
        .bind(organization_id)
        .fetch_all(pool)
        .await?;

        Ok(teams)
    }

    /// Update team
    pub async fn update(
        pool: &DbPool,
        id: Uuid,
        name: Option<&str>,
        description: Option<&str>,
        monthly_token_limit: Option<i64>,
    ) -> Result<(), DbError> {
        sqlx::query(
            r#"
            UPDATE teams SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                monthly_token_limit = COALESCE($4, monthly_token_limit)
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(description)
        .bind(monthly_token_limit)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Delete team
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM teams WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Increment team usage
    pub async fn increment_usage(
        pool: &DbPool,
        id: Uuid,
        input_tokens: i32,
        output_tokens: i32,
    ) -> Result<(), DbError> {
        sqlx::query("SELECT increment_team_usage($1, $2, $3)")
            .bind(id)
            .bind(input_tokens)
            .bind(output_tokens)
            .execute(pool)
            .await?;

        Ok(())
    }
}

/// Repository for team member operations
pub struct TeamMemberRepo;

impl TeamMemberRepo {
    /// Add a member to a team
    pub async fn add_member(pool: &DbPool, new: NewTeamMember) -> Result<TeamMember, DbError> {
        let member = sqlx::query_as::<_, TeamMember>(
            r#"
            INSERT INTO team_members (team_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(new.team_id)
        .bind(&new.user_id)
        .bind(&new.role)
        .fetch_one(pool)
        .await?;

        Ok(member)
    }

    /// Get members of a team
    pub async fn get_members(pool: &DbPool, team_id: Uuid) -> Result<Vec<TeamMember>, DbError> {
        let members = sqlx::query_as::<_, TeamMember>(
            "SELECT * FROM team_members WHERE team_id = $1 ORDER BY joined_at",
        )
        .bind(team_id)
        .fetch_all(pool)
        .await?;

        Ok(members)
    }

    /// Check if user is a member of a team
    pub async fn is_member(pool: &DbPool, team_id: Uuid, user_id: &str) -> Result<bool, DbError> {
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND user_id = $2")
                .bind(team_id)
                .bind(user_id)
                .fetch_one(pool)
                .await?;

        Ok(count.0 > 0)
    }

    /// Remove a member from a team
    pub async fn remove_member(pool: &DbPool, team_id: Uuid, user_id: &str) -> Result<(), DbError> {
        sqlx::query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2")
            .bind(team_id)
            .bind(user_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Get teams for a user
    pub async fn get_teams_for_user(pool: &DbPool, user_id: &str) -> Result<Vec<Team>, DbError> {
        let teams = sqlx::query_as::<_, Team>(
            r#"
            SELECT t.* FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            WHERE tm.user_id = $1
            ORDER BY t.name
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(teams)
    }
}

// ============================================================================
// Project Repository
// ============================================================================

/// Repository for project operations
pub struct ProjectRepo;

impl ProjectRepo {
    /// Create a new project
    pub async fn create(pool: &DbPool, new: NewProject) -> Result<Project, DbError> {
        let project = sqlx::query_as::<_, Project>(
            r#"
            INSERT INTO projects (team_id, name, slug, description, monthly_token_limit, settings)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(new.team_id)
        .bind(&new.name)
        .bind(&new.slug)
        .bind(&new.description)
        .bind(new.monthly_token_limit)
        .bind(&new.settings)
        .fetch_one(pool)
        .await?;

        Ok(project)
    }

    /// Find project by ID
    pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<Project>, DbError> {
        let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(project)
    }

    /// Find project by team and slug
    pub async fn find_by_team_and_slug(
        pool: &DbPool,
        team_id: Uuid,
        slug: &str,
    ) -> Result<Option<Project>, DbError> {
        let project =
            sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE team_id = $1 AND slug = $2")
                .bind(team_id)
                .bind(slug)
                .fetch_optional(pool)
                .await?;

        Ok(project)
    }

    /// Get all projects for a team
    pub async fn get_by_team(pool: &DbPool, team_id: Uuid) -> Result<Vec<Project>, DbError> {
        let projects =
            sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE team_id = $1 ORDER BY name")
                .bind(team_id)
                .fetch_all(pool)
                .await?;

        Ok(projects)
    }

    /// Get active projects for a team
    pub async fn get_active_by_team(pool: &DbPool, team_id: Uuid) -> Result<Vec<Project>, DbError> {
        let projects = sqlx::query_as::<_, Project>(
            "SELECT * FROM projects WHERE team_id = $1 AND status = 'active' ORDER BY name",
        )
        .bind(team_id)
        .fetch_all(pool)
        .await?;

        Ok(projects)
    }

    /// Update project status
    pub async fn update_status(pool: &DbPool, id: Uuid, status: &str) -> Result<(), DbError> {
        sqlx::query("UPDATE projects SET status = $2 WHERE id = $1")
            .bind(id)
            .bind(status)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Archive project
    pub async fn archive(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        Self::update_status(pool, id, "archived").await
    }

    /// Delete project
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM projects WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Increment project usage
    pub async fn increment_usage(
        pool: &DbPool,
        id: Uuid,
        input_tokens: i32,
        output_tokens: i32,
    ) -> Result<(), DbError> {
        sqlx::query("SELECT increment_project_usage($1, $2, $3)")
            .bind(id)
            .bind(input_tokens)
            .bind(output_tokens)
            .execute(pool)
            .await?;

        Ok(())
    }
}

// ============================================================================
// End User Repository
// ============================================================================

/// Repository for end user operations (consumer/client tracking)
pub struct EndUserRepo;

impl EndUserRepo {
    /// Upsert an end user - creates if not exists, updates if exists
    pub async fn upsert(pool: &DbPool, new: NewEndUser) -> Result<EndUser, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO end_users (organization_id, external_id, name, email, metadata)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (organization_id, external_id)
            DO UPDATE SET
                name = COALESCE(EXCLUDED.name, end_users.name),
                email = COALESCE(EXCLUDED.email, end_users.email),
                metadata = COALESCE(EXCLUDED.metadata, end_users.metadata),
                last_seen_at = NOW(),
                updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(new.organization_id)
        .bind(&new.external_id)
        .bind(&new.name)
        .bind(&new.email)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(Self::row_to_end_user(row))
    }

    /// Find end user by ID
    pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<EndUser>, DbError> {
        let row = sqlx::query("SELECT * FROM end_users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(row.map(Self::row_to_end_user))
    }

    /// Find end user by organization and external ID
    pub async fn find_by_external_id(
        pool: &DbPool,
        organization_id: Uuid,
        external_id: &str,
    ) -> Result<Option<EndUser>, DbError> {
        let row =
            sqlx::query("SELECT * FROM end_users WHERE organization_id = $1 AND external_id = $2")
                .bind(organization_id)
                .bind(external_id)
                .fetch_optional(pool)
                .await?;

        Ok(row.map(Self::row_to_end_user))
    }

    /// Get all end users for an organization
    pub async fn get_by_organization(
        pool: &DbPool,
        organization_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<EndUser>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM end_users
            WHERE organization_id = $1
            ORDER BY last_seen_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(organization_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_end_user).collect())
    }

    /// Get top end users by usage for an organization
    pub async fn get_top_by_usage(
        pool: &DbPool,
        organization_id: Uuid,
        limit: i64,
    ) -> Result<Vec<EndUser>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM end_users
            WHERE organization_id = $1
            ORDER BY (total_input_tokens + total_output_tokens) DESC
            LIMIT $2
            "#,
        )
        .bind(organization_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_end_user).collect())
    }

    /// Record usage for an end user
    pub async fn record_usage(
        pool: &DbPool,
        id: Uuid,
        input_tokens: i32,
        output_tokens: i32,
        cost_usd: Option<f64>,
    ) -> Result<(), DbError> {
        sqlx::query("SELECT record_end_user_usage($1, $2, $3, $4)")
            .bind(id)
            .bind(input_tokens)
            .bind(output_tokens)
            .bind(cost_usd)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Block an end user
    pub async fn block(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("UPDATE end_users SET is_blocked = true WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Unblock an end user
    pub async fn unblock(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("UPDATE end_users SET is_blocked = false WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Set rate limit for an end user
    pub async fn set_rate_limit(
        pool: &DbPool,
        id: Uuid,
        rate_limit_rpm: Option<i32>,
    ) -> Result<(), DbError> {
        sqlx::query("UPDATE end_users SET rate_limit_rpm = $2 WHERE id = $1")
            .bind(id)
            .bind(rate_limit_rpm)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Set monthly token limit for an end user
    pub async fn set_monthly_limit(
        pool: &DbPool,
        id: Uuid,
        monthly_token_limit: Option<i64>,
    ) -> Result<(), DbError> {
        sqlx::query("UPDATE end_users SET monthly_token_limit = $2 WHERE id = $1")
            .bind(id)
            .bind(monthly_token_limit)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Delete an end user
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM end_users WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    fn row_to_end_user(row: sqlx::postgres::PgRow) -> EndUser {
        EndUser {
            id: row.get("id"),
            organization_id: row.get("organization_id"),
            external_id: row.get("external_id"),
            name: row.get("name"),
            email: row.get("email"),
            total_input_tokens: row.get("total_input_tokens"),
            total_output_tokens: row.get("total_output_tokens"),
            total_cost_usd: row.get("total_cost_usd"),
            request_count: row.get("request_count"),
            rate_limit_rpm: row.get("rate_limit_rpm"),
            monthly_token_limit: row.get("monthly_token_limit"),
            current_month_tokens: row.get("current_month_tokens"),
            usage_reset_month: row.get("usage_reset_month"),
            is_blocked: row.get("is_blocked"),
            metadata: row.get("metadata"),
            first_seen_at: row.get("first_seen_at"),
            last_seen_at: row.get("last_seen_at"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }
}

// ============================================================================
// Feedback Sample Repository
// ============================================================================

/// Repository for feedback sample operations (adaptive few-shot learning)
pub struct FeedbackSampleRepo;

impl FeedbackSampleRepo {
    /// Create a new feedback sample
    pub async fn create(pool: &DbPool, new: NewFeedbackSample) -> Result<FeedbackSample, DbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO feedback_samples (
                organization_id, input_text, output_text, model_id,
                feedback, feedback_reason, feedback_by,
                tags, category, response_id, conversation_id,
                confidence_score, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
            "#,
        )
        .bind(new.organization_id)
        .bind(&new.input_text)
        .bind(&new.output_text)
        .bind(&new.model_id)
        .bind(&new.feedback)
        .bind(&new.feedback_reason)
        .bind(&new.feedback_by)
        .bind(&new.tags)
        .bind(&new.category)
        .bind(&new.response_id)
        .bind(new.conversation_id)
        .bind(new.confidence_score)
        .bind(&new.metadata)
        .fetch_one(pool)
        .await?;

        Ok(Self::row_to_sample(row))
    }

    /// Find sample by ID
    pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<FeedbackSample>, DbError> {
        let row = sqlx::query("SELECT * FROM feedback_samples WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;

        Ok(row.map(Self::row_to_sample))
    }

    /// Get approved samples for an organization
    pub async fn get_approved(
        pool: &DbPool,
        organization_id: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<FeedbackSample>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM feedback_samples
            WHERE feedback = 'approved'
              AND (organization_id = $1 OR ($1 IS NULL AND organization_id IS NULL))
            ORDER BY use_count DESC, created_at DESC
            LIMIT $2
            "#,
        )
        .bind(organization_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_sample).collect())
    }

    /// Get samples by category
    pub async fn get_by_category(
        pool: &DbPool,
        organization_id: Option<Uuid>,
        category: &str,
        feedback: Option<&str>,
        limit: i64,
    ) -> Result<Vec<FeedbackSample>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM feedback_samples
            WHERE category = $1
              AND (organization_id = $2 OR ($2 IS NULL AND organization_id IS NULL))
              AND ($3 IS NULL OR feedback = $3)
            ORDER BY use_count DESC, created_at DESC
            LIMIT $4
            "#,
        )
        .bind(category)
        .bind(organization_id)
        .bind(feedback)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_sample).collect())
    }

    /// Get samples by tags (returns samples that have ANY of the provided tags)
    pub async fn get_by_tags(
        pool: &DbPool,
        organization_id: Option<Uuid>,
        tags: &[String],
        feedback: Option<&str>,
        limit: i64,
    ) -> Result<Vec<FeedbackSample>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM feedback_samples
            WHERE tags && $1
              AND (organization_id = $2 OR ($2 IS NULL AND organization_id IS NULL))
              AND ($3 IS NULL OR feedback = $3)
            ORDER BY use_count DESC, created_at DESC
            LIMIT $4
            "#,
        )
        .bind(tags)
        .bind(organization_id)
        .bind(feedback)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_sample).collect())
    }

    /// Search samples by text (full-text search)
    pub async fn search(
        pool: &DbPool,
        organization_id: Option<Uuid>,
        query: &str,
        feedback: Option<&str>,
        limit: i64,
    ) -> Result<Vec<FeedbackSample>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT *, ts_rank(to_tsvector('english', input_text), plainto_tsquery('english', $1)) as rank
            FROM feedback_samples
            WHERE to_tsvector('english', input_text) @@ plainto_tsquery('english', $1)
              AND (organization_id = $2 OR ($2 IS NULL AND organization_id IS NULL))
              AND ($3 IS NULL OR feedback = $3)
            ORDER BY rank DESC, use_count DESC
            LIMIT $4
            "#,
        )
        .bind(query)
        .bind(organization_id)
        .bind(feedback)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_sample).collect())
    }

    /// Get recent samples for an organization
    pub async fn get_recent(
        pool: &DbPool,
        organization_id: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<FeedbackSample>, DbError> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM feedback_samples
            WHERE organization_id = $1 OR ($1 IS NULL AND organization_id IS NULL)
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(organization_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Self::row_to_sample).collect())
    }

    /// Increment use count for a sample
    pub async fn increment_use_count(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("SELECT increment_sample_use_count($1)")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Update sample feedback
    pub async fn update_feedback(
        pool: &DbPool,
        id: Uuid,
        feedback: &str,
        reason: Option<&str>,
    ) -> Result<(), DbError> {
        sqlx::query(
            "UPDATE feedback_samples SET feedback = $2, feedback_reason = $3 WHERE id = $1",
        )
        .bind(id)
        .bind(feedback)
        .bind(reason)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update sample tags
    pub async fn update_tags(pool: &DbPool, id: Uuid, tags: &[String]) -> Result<(), DbError> {
        sqlx::query("UPDATE feedback_samples SET tags = $2 WHERE id = $1")
            .bind(id)
            .bind(tags)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Update sample category
    pub async fn update_category(
        pool: &DbPool,
        id: Uuid,
        category: Option<&str>,
    ) -> Result<(), DbError> {
        sqlx::query("UPDATE feedback_samples SET category = $2 WHERE id = $1")
            .bind(id)
            .bind(category)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Delete a sample
    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<(), DbError> {
        sqlx::query("DELETE FROM feedback_samples WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Get sample statistics for an organization
    pub async fn get_stats(
        pool: &DbPool,
        organization_id: Option<Uuid>,
    ) -> Result<FeedbackSampleStats, DbError> {
        let row = sqlx::query(
            r#"
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE feedback = 'approved') as approved,
                COUNT(*) FILTER (WHERE feedback = 'rejected') as rejected,
                SUM(use_count) as total_uses
            FROM feedback_samples
            WHERE organization_id = $1 OR ($1 IS NULL AND organization_id IS NULL)
            "#,
        )
        .bind(organization_id)
        .fetch_one(pool)
        .await?;

        Ok(FeedbackSampleStats {
            total: row.get::<i64, _>("total") as u64,
            approved: row.get::<i64, _>("approved") as u64,
            rejected: row.get::<i64, _>("rejected") as u64,
            total_uses: row.get::<Option<i64>, _>("total_uses").unwrap_or(0) as u64,
        })
    }

    fn row_to_sample(row: sqlx::postgres::PgRow) -> FeedbackSample {
        FeedbackSample {
            id: row.get("id"),
            organization_id: row.get("organization_id"),
            input_text: row.get("input_text"),
            output_text: row.get("output_text"),
            model_id: row.get("model_id"),
            feedback: row.get("feedback"),
            feedback_reason: row.get("feedback_reason"),
            feedback_by: row.get("feedback_by"),
            tags: row.get("tags"),
            category: row.get("category"),
            response_id: row.get("response_id"),
            conversation_id: row.get("conversation_id"),
            confidence_score: row.get("confidence_score"),
            use_count: row.get("use_count"),
            metadata: row.get("metadata"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }
    }
}

/// Statistics for feedback samples
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackSampleStats {
    pub total: u64,
    pub approved: u64,
    pub rejected: u64,
    pub total_uses: u64,
}
