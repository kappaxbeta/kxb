export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_applications: {
        Row: {
          consent_at: string | null
          consent_ip: unknown
          consent_user_agent: string | null
          created_at: string
          created_ip: unknown
          email: string
          id: string
          newsletter_consent: boolean
          note: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          username: string | null
        }
        Insert: {
          consent_at?: string | null
          consent_ip?: unknown
          consent_user_agent?: string | null
          created_at?: string
          created_ip?: unknown
          email: string
          id?: string
          newsletter_consent?: boolean
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          username?: string | null
        }
        Update: {
          consent_at?: string | null
          consent_ip?: unknown
          consent_user_agent?: string | null
          created_at?: string
          created_ip?: unknown
          email?: string
          id?: string
          newsletter_consent?: boolean
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          username?: string | null
        }
        Relationships: []
      }
      account_invites: {
        Row: {
          application_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          id: string
          last_redeemed_at: string | null
          last_redeemed_by: string | null
          max_uses: number
          note: string | null
          revoked_at: string | null
          token: string
          uses: number
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          last_redeemed_at?: string | null
          last_redeemed_by?: string | null
          max_uses?: number
          note?: string | null
          revoked_at?: string | null
          token: string
          uses?: number
        }
        Update: {
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          last_redeemed_at?: string | null
          last_redeemed_by?: string | null
          max_uses?: number
          note?: string | null
          revoked_at?: string | null
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_invites_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "account_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      agents_read_model: {
        Row: {
          adopted_at: string
          agent_id: string
          avatar: string
          name: string
          owner_id: string
          place: string
          tenant_id: string
        }
        Insert: {
          adopted_at: string
          agent_id: string
          avatar: string
          name: string
          owner_id: string
          place: string
          tenant_id: string
        }
        Update: {
          adopted_at?: string
          agent_id?: string
          avatar?: string
          name?: string
          owner_id?: string
          place?: string
          tenant_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          country: string | null
          id: number
          name: string
          occurred_at: string
          path: string
          props: Json
          user_id: string | null
          variant: string | null
          visitor_hash: string
        }
        Insert: {
          country?: string | null
          id?: never
          name: string
          occurred_at?: string
          path: string
          props?: Json
          user_id?: string | null
          variant?: string | null
          visitor_hash: string
        }
        Update: {
          country?: string | null
          id?: never
          name?: string
          occurred_at?: string
          path?: string
          props?: Json
          user_id?: string | null
          variant?: string | null
          visitor_hash?: string
        }
        Relationships: []
      }
      backoffice_admins: {
        Row: {
          created_at: string
          email: string
          granted_by: string | null
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          granted_by?: string | null
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          granted_by?: string | null
          note?: string | null
        }
        Relationships: []
      }
      backoffice_audit: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          section: string
          summary: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          section: string
          summary: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          section?: string
          summary?: string
        }
        Relationships: []
      }
      backoffice_grants: {
        Row: {
          created_at: string
          email: string
          granted_by: string | null
          level: string
          section: string
        }
        Insert: {
          created_at?: string
          email: string
          granted_by?: string | null
          level: string
          section: string
        }
        Update: {
          created_at?: string
          email?: string
          granted_by?: string | null
          level?: string
          section?: string
        }
        Relationships: []
      }
      banned_worlds: {
        Row: {
          banned_by: string | null
          created_at: string
          reason: string
          world_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          reason: string
          world_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          reason?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banned_worlds_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: true
            referencedRelation: "battlefields_read_model"
            referencedColumns: ["world_id"]
          },
        ]
      }
      battle_goals: {
        Row: {
          battle_id: string
          goal_id: string
          own_goal: boolean
          scored_at: string
          scored_by: string | null
          side: string
        }
        Insert: {
          battle_id: string
          goal_id: string
          own_goal?: boolean
          scored_at: string
          scored_by?: string | null
          side: string
        }
        Update: {
          battle_id?: string
          goal_id?: string
          own_goal?: boolean
          scored_at?: string
          scored_by?: string | null
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_goals_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_participants: {
        Row: {
          battle_id: string
          defeated: boolean
          finish_place: number | null
          finish_seconds: number | null
          joined_at: string
          ready: boolean
          side: string | null
          tenant_id: string
          user_id: string
          wants_rematch: boolean
        }
        Insert: {
          battle_id: string
          defeated?: boolean
          finish_place?: number | null
          finish_seconds?: number | null
          joined_at?: string
          ready?: boolean
          side?: string | null
          tenant_id: string
          user_id: string
          wants_rematch?: boolean
        }
        Update: {
          battle_id?: string
          defeated?: boolean
          finish_place?: number | null
          finish_seconds?: number | null
          joined_at?: string
          ready?: boolean
          side?: string | null
          tenant_id?: string
          user_id?: string
          wants_rematch?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "battle_participants_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_payouts: {
        Row: {
          battle_id: string
          paid_at: string
          phase: string
          tenant_id: string
        }
        Insert: {
          battle_id: string
          paid_at?: string
          phase: string
          tenant_id: string
        }
        Update: {
          battle_id?: string
          paid_at?: string
          phase?: string
          tenant_id?: string
        }
        Relationships: []
      }
      battle_scores: {
        Row: {
          played: number
          tenant_id: string
          updated_at: string
          user_id: string
          won: number
        }
        Insert: {
          played?: number
          tenant_id: string
          updated_at?: string
          user_id: string
          won?: number
        }
        Update: {
          played?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      battlefields_read_model: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          name: string
          tenant_id: string
          updated_at: string
          version: number
          visibility: string
          world_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          name: string
          tenant_id: string
          updated_at?: string
          version?: number
          visibility?: string
          world_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          visibility?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battlefields_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battlefields_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      battles_read_model: {
        Row: {
          abandoned: boolean
          created_at: string
          created_by: string | null
          damage_on: boolean | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          mode: string
          name: string
          rematch_battle_id: string | null
          respawn_on: boolean | null
          score_blue: number
          score_limit: number | null
          score_red: number
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          version: number
          winner_id: string | null
          winner_type: string | null
          world_id: string
          xp_id: string | null
          xp_rules: Json | null
        }
        Insert: {
          abandoned?: boolean
          created_at?: string
          created_by?: string | null
          damage_on?: boolean | null
          duration_minutes?: number | null
          ended_at?: string | null
          id: string
          mode: string
          name: string
          rematch_battle_id?: string | null
          respawn_on?: boolean | null
          score_blue?: number
          score_limit?: number | null
          score_red?: number
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          winner_id?: string | null
          winner_type?: string | null
          world_id: string
          xp_id?: string | null
          xp_rules?: Json | null
        }
        Update: {
          abandoned?: boolean
          created_at?: string
          created_by?: string | null
          damage_on?: boolean | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          mode?: string
          name?: string
          rematch_battle_id?: string | null
          respawn_on?: boolean | null
          score_blue?: number
          score_limit?: number | null
          score_red?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          winner_id?: string | null
          winner_type?: string | null
          world_id?: string
          xp_id?: string | null
          xp_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "battles_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      board_posts_read_model: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          deleted: boolean
          edited: boolean
          id: string
          image_slug: string | null
          pinned: boolean
          reactions: Json
          scene_id: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at: string
          created_by?: string | null
          deleted?: boolean
          edited?: boolean
          id: string
          image_slug?: string | null
          pinned?: boolean
          reactions?: Json
          scene_id?: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          edited?: boolean
          id?: string
          image_slug?: string | null
          pinned?: boolean
          reactions?: Json
          scene_id?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      builtin_xps: {
        Row: {
          bytes: number | null
          created_at: string
          document: Json | null
          id: string
          published: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          document?: Json | null
          id: string
          published?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          document?: Json | null
          id?: string
          published?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      channel_bible_read_model: {
        Row: {
          created_at: string
          doc: Json
          id: string
          image_url: string | null
          kind: string
          model: string | null
          name: string
          position: number
          show_id: string
          summary: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc?: Json
          id: string
          image_url?: string | null
          kind?: string
          model?: string | null
          name: string
          position?: number
          show_id: string
          summary?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc?: Json
          id?: string
          image_url?: string | null
          kind?: string
          model?: string | null
          name?: string
          position?: number
          show_id?: string
          summary?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_bible_read_model_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "channel_shows_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_bible_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_bible_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_comments_read_model: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          episode_id: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          episode_id: string
          id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          episode_id?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_comments_read_model_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "channel_episodes_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_comments_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_comments_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_episode_access: {
        Row: {
          episode_id: string
          paid: number
          paid_at: string
          user_id: string
        }
        Insert: {
          episode_id: string
          paid: number
          paid_at?: string
          user_id: string
        }
        Update: {
          episode_id?: string
          paid?: number
          paid_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_episode_access_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "channel_episodes_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_episodes_read_model: {
        Row: {
          created_at: string
          doc: Json
          id: string
          major: number
          minor: number
          number: number
          patch: number
          price: number
          season_id: string
          show_id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc?: Json
          id: string
          major?: number
          minor?: number
          number: number
          patch?: number
          price?: number
          season_id: string
          show_id: string
          status?: string
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc?: Json
          id?: string
          major?: number
          minor?: number
          number?: number
          patch?: number
          price?: number
          season_id?: string
          show_id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_episodes_read_model_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "channel_seasons_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_episodes_read_model_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "channel_shows_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_episodes_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_episodes_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_releases_read_model: {
        Row: {
          aired_at: string
          channel_slug: string
          doc: Json
          episode_id: string
          first_aired_at: string
          hidden: boolean
          number: number
          price: number
          season: number
          show_id: string
          show_slug: string
          show_title: string
          tenant_id: string
          title: string
          version: string
        }
        Insert: {
          aired_at?: string
          channel_slug: string
          doc: Json
          episode_id: string
          first_aired_at?: string
          hidden?: boolean
          number: number
          price?: number
          season: number
          show_id: string
          show_slug: string
          show_title: string
          tenant_id: string
          title: string
          version: string
        }
        Update: {
          aired_at?: string
          channel_slug?: string
          doc?: Json
          episode_id?: string
          first_aired_at?: string
          hidden?: boolean
          number?: number
          price?: number
          season?: number
          show_id?: string
          show_slug?: string
          show_title?: string
          tenant_id?: string
          title?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_releases_read_model_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "channel_episodes_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_releases_read_model_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "channel_shows_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_releases_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_releases_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_seasons_read_model: {
        Row: {
          created_at: string
          id: string
          number: number
          show_id: string
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id: string
          number: number
          show_id: string
          tenant_id: string
          title?: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: number
          show_id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_seasons_read_model_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "channel_shows_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_seasons_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_seasons_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_show_members: {
        Row: {
          added_at: string
          added_by: string | null
          role: string
          show_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          role: string
          show_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          role?: string
          show_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_show_members_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "channel_shows_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_shows_read_model: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          first_aired_at: string | null
          id: string
          logline: string
          slug: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          first_aired_at?: string | null
          id: string
          logline?: string
          slug: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          first_aired_at?: string | null
          id?: string
          logline?: string
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_shows_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shows_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reason: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reason: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reason?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_read_model: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          room_id: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body: string
          created_at: string
          id: string
          room_id?: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          room_id?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      closed_accounts: {
        Row: {
          closed_at: string
          spaces_archived: number
          spaces_left: number
          user_id: string
        }
        Insert: {
          closed_at?: string
          spaces_archived?: number
          spaces_left?: number
          user_id: string
        }
        Update: {
          closed_at?: string
          spaces_archived?: number
          spaces_left?: number
          user_id?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          event_size: string | null
          event_type: string | null
          event_when: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          kind: string
          message: string
          path: string | null
          phone: string | null
          status: string
          subject: string
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          email: string
          event_size?: string | null
          event_type?: string | null
          event_when?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          message: string
          path?: string | null
          phone?: string | null
          status?: string
          subject: string
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          email?: string
          event_size?: string | null
          event_type?: string | null
          event_when?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          message?: string
          path?: string | null
          phone?: string | null
          status?: string
          subject?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          created_at: string
          id: string
          kind: string
          reason: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          tenant_id: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          reason: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          tenant_id?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          reason?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          tenant_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_settings: {
        Row: {
          code: string
          draws_on: string
          ends_on: string
          handle: string
          hashtag: string
          id: boolean
          live: boolean
          min_age: number
          prizes: number[]
          starts_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string
          draws_on?: string
          ends_on?: string
          handle?: string
          hashtag?: string
          id?: boolean
          live?: boolean
          min_age?: number
          prizes?: number[]
          starts_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          draws_on?: string
          ends_on?: string
          handle?: string
          hashtag?: string
          id?: boolean
          live?: boolean
          min_age?: number
          prizes?: number[]
          starts_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      error_reports: {
        Row: {
          created_at: string
          digest: string | null
          fingerprint: string
          id: string
          message: string
          method: string | null
          path: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          source: string
          stack: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          digest?: string | null
          fingerprint: string
          id?: string
          message: string
          method?: string | null
          path?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          source: string
          stack?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          digest?: string | null
          fingerprint?: string
          id?: string
          message?: string
          method?: string | null
          path?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      event_banners: {
        Row: {
          author_id: string | null
          created_at: string
          document: Json
          id: string
          name: string
          poster_slug: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          document: Json
          id?: string
          name: string
          poster_slug?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          document?: Json
          id?: string
          name?: string
          poster_slug?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_banners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_banners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      event_machines: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          error: string | null
          guest_url: string | null
          ip: string | null
          log: string
          requested_by: string | null
          server_id: number | null
          server_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          guest_url?: string | null
          ip?: string | null
          log?: string
          requested_by?: string | null
          server_id?: number | null
          server_type?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          guest_url?: string | null
          ip?: string | null
          log?: string
          requested_by?: string | null
          server_id?: number | null
          server_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_machines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_machines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      event_spaces: {
        Row: {
          banner_id: string | null
          banner_link_id: string | null
          blurb: string | null
          closes_at: string
          created_at: string
          created_by: string | null
          featured: boolean
          guest_writes: string[]
          headline: string | null
          links: Json
          note: string | null
          opens_at: string
          preset: string
          room_cap: number
          room_max: number
          room_overflow: boolean
          surfaces: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          banner_id?: string | null
          banner_link_id?: string | null
          blurb?: string | null
          closes_at: string
          created_at?: string
          created_by?: string | null
          featured?: boolean
          guest_writes?: string[]
          headline?: string | null
          links?: Json
          note?: string | null
          opens_at: string
          preset: string
          room_cap?: number
          room_max?: number
          room_overflow?: boolean
          surfaces?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          banner_id?: string | null
          banner_link_id?: string | null
          blurb?: string | null
          closes_at?: string
          created_at?: string
          created_by?: string | null
          featured?: boolean
          guest_writes?: string[]
          headline?: string | null
          links?: Json
          note?: string | null
          opens_at?: string
          preset?: string
          room_cap?: number
          room_max?: number
          room_overflow?: boolean
          surfaces?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_spaces_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "event_banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_spaces_banner_link_id_fkey"
            columns: ["banner_link_id"]
            isOneToOne: false
            referencedRelation: "guest_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_spaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_spaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          global_seq: number
          metadata: Json
          stream_id: string
          stream_type: string
          tenant_id: string
          tenant_seq: number
          type: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          global_seq?: never
          metadata?: Json
          stream_id: string
          stream_type: string
          tenant_id: string
          tenant_seq: number
          type: string
          version: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          global_seq?: never
          metadata?: Json
          stream_id?: string
          stream_type?: string
          tenant_id?: string
          tenant_seq?: number
          type?: string
          version?: number
        }
        Relationships: []
      }
      feature_flag_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          flag_key: string
          granted_by: string | null
          note: string | null
          scope: string
          scope_id: string
          value_int: number | null
        }
        Insert: {
          created_at?: string
          enabled: boolean
          flag_key: string
          granted_by?: string | null
          note?: string | null
          scope: string
          scope_id: string
          value_int?: number | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_key?: string
          granted_by?: string | null
          note?: string | null
          scope?: string
          scope_id?: string
          value_int?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          label: string
          updated_at: string
          value_int: number | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          label: string
          updated_at?: string
          value_int?: number | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
          value_int?: number | null
        }
        Relationships: []
      }
      guest_links: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          expires_at: string | null
          id: string
          label: string | null
          max_uses: number | null
          requires_knock: boolean
          revoked_at: string | null
          tenant_id: string
          token: string
          uses: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          requires_knock?: boolean
          revoked_at?: string | null
          tenant_id: string
          token: string
          uses?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          requires_knock?: boolean
          revoked_at?: string | null
          tenant_id?: string
          token?: string
          uses?: number
        }
        Relationships: []
      }
      health_samples: {
        Row: {
          build_id: string | null
          db_connections: number | null
          db_size_bytes: number | null
          deps: Json
          disk_free_bytes: number | null
          disk_total_bytes: number | null
          errors_total: number | null
          event_loop_lag_ms: number | null
          heap_total_bytes: number | null
          heap_used_bytes: number | null
          id: string
          replica: string
          requests_total: number | null
          rss_bytes: number | null
          sampled_at: string
          status: string
          uptime_seconds: number | null
        }
        Insert: {
          build_id?: string | null
          db_connections?: number | null
          db_size_bytes?: number | null
          deps?: Json
          disk_free_bytes?: number | null
          disk_total_bytes?: number | null
          errors_total?: number | null
          event_loop_lag_ms?: number | null
          heap_total_bytes?: number | null
          heap_used_bytes?: number | null
          id?: string
          replica: string
          requests_total?: number | null
          rss_bytes?: number | null
          sampled_at?: string
          status: string
          uptime_seconds?: number | null
        }
        Update: {
          build_id?: string | null
          db_connections?: number | null
          db_size_bytes?: number | null
          deps?: Json
          disk_free_bytes?: number | null
          disk_total_bytes?: number | null
          errors_total?: number | null
          event_loop_lag_ms?: number | null
          heap_total_bytes?: number | null
          heap_used_bytes?: number | null
          id?: string
          replica?: string
          requests_total?: number | null
          rss_bytes?: number | null
          sampled_at?: string
          status?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      hidden_chat_messages: {
        Row: {
          created_at: string
          hidden_by: string | null
          message_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          hidden_by?: string | null
          message_id: string
          reason: string
        }
        Update: {
          created_at?: string
          hidden_by?: string | null
          message_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_chat_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "chat_messages_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_content: {
        Row: {
          created_at: string
          hidden_by: string | null
          kind: string
          reason: string
          target_id: string
        }
        Insert: {
          created_at?: string
          hidden_by?: string | null
          kind: string
          reason: string
          target_id: string
        }
        Update: {
          created_at?: string
          hidden_by?: string | null
          kind?: string
          reason?: string
          target_id?: string
        }
        Relationships: []
      }
      homestead_ground_read_model: {
        Row: {
          bought_at: string
          place: string
          tenant_id: string
          tile: string
          user_id: string
        }
        Insert: {
          bought_at?: string
          place: string
          tenant_id: string
          tile: string
          user_id: string
        }
        Update: {
          bought_at?: string
          place?: string
          tenant_id?: string
          tile?: string
          user_id?: string
        }
        Relationships: []
      }
      homestead_props_read_model: {
        Row: {
          place: string
          placed_at: string
          prop_id: string
          rot_y: number
          tenant_id: string
          tile: string
          topper_id: string | null
          topper_rot_y: number | null
          user_id: string
        }
        Insert: {
          place: string
          placed_at?: string
          prop_id: string
          rot_y?: number
          tenant_id: string
          tile: string
          topper_id?: string | null
          topper_rot_y?: number | null
          user_id: string
        }
        Update: {
          place?: string
          placed_at?: string
          prop_id?: string
          rot_y?: number
          tenant_id?: string
          tile?: string
          topper_id?: string | null
          topper_rot_y?: number | null
          user_id?: string
        }
        Relationships: []
      }
      homestead_read_model: {
        Row: {
          access_mode: string
          coins: number
          created_at: string
          earned: number
          served: number
          tenant_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          access_mode?: string
          coins?: number
          created_at: string
          earned?: number
          served?: number
          tenant_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Update: {
          access_mode?: string
          coins?: number
          created_at?: string
          earned?: number
          served?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      host_samples: {
        Row: {
          cpu_cores: number | null
          cpu_idle: number | null
          cpu_total: number | null
          disk_free_bytes: number | null
          disk_total_bytes: number | null
          host: string
          hostname: string | null
          id: string
          load1: number | null
          load15: number | null
          load5: number | null
          mem_available_bytes: number | null
          mem_total_bytes: number | null
          sampled_at: string
          swap_free_bytes: number | null
          swap_total_bytes: number | null
          uptime_seconds: number | null
        }
        Insert: {
          cpu_cores?: number | null
          cpu_idle?: number | null
          cpu_total?: number | null
          disk_free_bytes?: number | null
          disk_total_bytes?: number | null
          host: string
          hostname?: string | null
          id?: string
          load1?: number | null
          load15?: number | null
          load5?: number | null
          mem_available_bytes?: number | null
          mem_total_bytes?: number | null
          sampled_at?: string
          swap_free_bytes?: number | null
          swap_total_bytes?: number | null
          uptime_seconds?: number | null
        }
        Update: {
          cpu_cores?: number | null
          cpu_idle?: number | null
          cpu_total?: number | null
          disk_free_bytes?: number | null
          disk_total_bytes?: number | null
          host?: string
          hostname?: string | null
          id?: string
          load1?: number | null
          load15?: number | null
          load5?: number | null
          mem_available_bytes?: number | null
          mem_total_bytes?: number | null
          sampled_at?: string
          swap_free_bytes?: number | null
          swap_total_bytes?: number | null
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      leaderboard_hidden: {
        Row: {
          created_at: string
          hidden_by: string
          reason: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hidden_by: string
          reason: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hidden_by?: string
          reason?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_hidden_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_hidden_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      login_streaks_read_model: {
        Row: {
          current_streak: number
          last_day: string
          longest_streak: number
          stream_id: string
          tenant_id: string
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_day: string
          longest_streak?: number
          stream_id: string
          tenant_id: string
          total_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_day?: string
          longest_streak?: number
          stream_id?: string
          tenant_id?: string
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_streaks_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_streaks_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      lounge_avatars_read_model: {
        Row: {
          created_at: string
          id: string
          model: string
          tenant_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at: string
          id: string
          model: string
          tenant_id: string
          updated_at: string
          user_id: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      lounge_blocks_read_model: {
        Row: {
          color: string | null
          cx: number
          cz: number
          placed_at: string
          placed_by: string | null
          tenant_id: string
          type: string
          world_id: string
          x: number
          y: number
          z: number
        }
        Insert: {
          color?: string | null
          cx: number
          cz: number
          placed_at?: string
          placed_by?: string | null
          tenant_id: string
          type: string
          world_id: string
          x: number
          y: number
          z: number
        }
        Update: {
          color?: string | null
          cx?: number
          cz?: number
          placed_at?: string
          placed_by?: string | null
          tenant_id?: string
          type?: string
          world_id?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      lounge_goals_read_model: {
        Row: {
          created_at: string
          deleted: boolean
          facing: number
          height: number
          id: string
          kind: string
          placed_by: string | null
          team: string | null
          tenant_id: string
          updated_at: string
          version: number
          width: number
          world_id: string
          x: number
          y: number
          z: number
        }
        Insert: {
          created_at: string
          deleted?: boolean
          facing?: number
          height?: number
          id: string
          kind?: string
          placed_by?: string | null
          team?: string | null
          tenant_id: string
          updated_at: string
          version: number
          width?: number
          world_id: string
          x: number
          y: number
          z: number
        }
        Update: {
          created_at?: string
          deleted?: boolean
          facing?: number
          height?: number
          id?: string
          kind?: string
          placed_by?: string | null
          team?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
          width?: number
          world_id?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      lounge_images_read_model: {
        Row: {
          created_at: string
          deleted: boolean
          facing: number
          height: number
          id: string
          placed_by: string | null
          tenant_id: string
          updated_at: string
          upload_slug: string
          version: number
          width: number
          x: number
          y: number
          z: number
        }
        Insert: {
          created_at: string
          deleted?: boolean
          facing?: number
          height?: number
          id: string
          placed_by?: string | null
          tenant_id: string
          updated_at: string
          upload_slug: string
          version: number
          width?: number
          x: number
          y: number
          z: number
        }
        Update: {
          created_at?: string
          deleted?: boolean
          facing?: number
          height?: number
          id?: string
          placed_by?: string | null
          tenant_id?: string
          updated_at?: string
          upload_slug?: string
          version?: number
          width?: number
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      magazine_read_model: {
        Row: {
          added_at: string
          added_by: string | null
          name: string
          tenant_id: string
          xp_ref: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          name: string
          tenant_id: string
          xp_ref: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          name?: string
          tenant_id?: string
          xp_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      magazine_settings: {
        Row: {
          auto_update: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_update?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_update?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "magazine_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "magazine_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      news_subscribers: {
        Row: {
          confirm_token: string
          confirmed_at: string | null
          consent_text: string
          consented_at: string
          created_at: string
          email: string
          id: string
          locale: string
          source_path: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          confirm_token?: string
          confirmed_at?: string | null
          consent_text: string
          consented_at?: string
          created_at?: string
          email: string
          id?: string
          locale?: string
          source_path?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          confirm_token?: string
          confirmed_at?: string | null
          consent_text?: string
          consented_at?: string
          created_at?: string
          email?: string
          id?: string
          locale?: string
          source_path?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      oasis_chapters: {
        Row: {
          published: boolean
          published_at: string | null
          slug: string
          updated_at: string
          updated_by: string | null
          work: string
        }
        Insert: {
          published?: boolean
          published_at?: string | null
          slug: string
          updated_at?: string
          updated_by?: string | null
          work?: string
        }
        Update: {
          published?: boolean
          published_at?: string | null
          slug?: string
          updated_at?: string
          updated_by?: string | null
          work?: string
        }
        Relationships: []
      }
      page_comments_read_model: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          page_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id: string
          page_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          page_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_comments_read_model_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_comments_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_comments_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          country: string | null
          device: string
          id: number
          language: string | null
          occurred_at: string
          path: string
          referrer_host: string | null
          user_id: string | null
          variant: string | null
          visitor_hash: string
        }
        Insert: {
          country?: string | null
          device?: string
          id?: never
          language?: string | null
          occurred_at?: string
          path: string
          referrer_host?: string | null
          user_id?: string | null
          variant?: string | null
          visitor_hash: string
        }
        Update: {
          country?: string | null
          device?: string
          id?: never
          language?: string | null
          occurred_at?: string
          path?: string
          referrer_host?: string | null
          user_id?: string | null
          variant?: string | null
          visitor_hash?: string
        }
        Relationships: []
      }
      pages_read_model: {
        Row: {
          created_at: string
          created_by: string | null
          deleted: boolean
          doc: Json
          id: string
          parent_id: string | null
          position: number
          tenant_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at: string
          created_by?: string | null
          deleted?: boolean
          doc?: Json
          id: string
          parent_id?: string | null
          position?: number
          tenant_id: string
          title: string
          updated_at: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          doc?: Json
          id?: string
          parent_id?: string | null
          position?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pages_read_model_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pages_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_news: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          headline: string
          id: string
          image: string | null
          links: Json
          published: boolean
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          headline: string
          id?: string
          image?: string | null
          links?: Json
          published?: boolean
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          headline?: string
          id?: string
          image?: string | null
          links?: Json
          published?: boolean
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_news_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_news_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_avatars: {
        Row: {
          model: string
          show_xp: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          model: string
          show_xp?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          model?: string
          show_xp?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_locales: {
        Row: {
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          locale: string
          updated_at?: string
          user_id: string
        }
        Update: {
          locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_skins: {
        Row: {
          model: string
          updated_at: string
          user_id: string
        }
        Insert: {
          model: string
          updated_at?: string
          user_id: string
        }
        Update: {
          model?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_skins_model_fkey"
            columns: ["model"]
            isOneToOne: false
            referencedRelation: "skins"
            referencedColumns: ["id"]
          },
        ]
      }
      projection_checkpoints: {
        Row: {
          last_seq: number
          projection: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          last_seq?: number
          projection: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          last_seq?: number
          projection?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projection_sweeps: {
        Row: {
          applied: number
          errors: Json | null
          failed: number
          id: number
          ms: number
          pending: number
          projections: number
          ran_at: string
          remaining: number
          spaces: number
          swept: number
        }
        Insert: {
          applied: number
          errors?: Json | null
          failed: number
          id?: never
          ms: number
          pending: number
          projections: number
          ran_at?: string
          remaining: number
          spaces: number
          swept: number
        }
        Update: {
          applied?: number
          errors?: Json | null
          failed?: number
          id?: never
          ms?: number
          pending?: number
          projections?: number
          ran_at?: string
          remaining?: number
          spaces?: number
          swept?: number
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          bucks: number
          campaign: string | null
          code: string
          coins: number
          created_at: string
          created_by: string | null
          expires_at: string | null
          free_days: number | null
          id: string
          label: string | null
          max_uses: number | null
          revoked_at: string | null
          spaces: number | null
          starts_at: string | null
          tier: string
          uses: number
          vouchers: number
        }
        Insert: {
          bucks?: number
          campaign?: string | null
          code: string
          coins?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          free_days?: number | null
          id?: string
          label?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          spaces?: number | null
          starts_at?: string | null
          tier?: string
          uses?: number
          vouchers?: number
        }
        Update: {
          bucks?: number
          campaign?: string | null
          code?: string
          coins?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          free_days?: number | null
          id?: string
          label?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          spaces?: number | null
          starts_at?: string | null
          tier?: string
          uses?: number
          vouchers?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          campaign: string | null
          code_id: string
          created_at: string
          granted_bucks: number
          granted_coins: number
          granted_days: number | null
          granted_spaces: number | null
          granted_tier: string
          granted_until: string | null
          granted_vouchers: number
          id: string
          source: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          campaign?: string | null
          code_id: string
          created_at?: string
          granted_bucks?: number
          granted_coins?: number
          granted_days?: number | null
          granted_spaces?: number | null
          granted_tier?: string
          granted_until?: string | null
          granted_vouchers?: number
          id?: string
          source?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          campaign?: string | null
          code_id?: string
          created_at?: string
          granted_bucks?: number
          granted_coins?: number
          granted_days?: number | null
          granted_spaces?: number | null
          granted_tier?: string
          granted_until?: string | null
          granted_vouchers?: number
          id?: string
          source?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      published_scenes: {
        Row: {
          author_id: string | null
          blurb: string | null
          cast_size: number
          created_at: string
          document: Json
          forked_from: string | null
          id: string
          name: string
          origin: string
          seconds: number
          tenant_id: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          blurb?: string | null
          cast_size?: number
          created_at?: string
          document: Json
          forked_from?: string | null
          id?: string
          name: string
          origin: string
          seconds?: number
          tenant_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          blurb?: string | null
          cast_size?: number
          created_at?: string
          document?: Json
          forked_from?: string | null
          id?: string
          name?: string
          origin?: string
          seconds?: number
          tenant_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_scenes_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "published_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_scenes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_scenes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      published_world_reports: {
        Row: {
          created_at: string
          note: string | null
          reason: string
          reported_by: string
          world_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          reason: string
          reported_by: string
          world_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          reason?: string
          reported_by?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_world_reports_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "published_worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      published_worlds: {
        Row: {
          approved_at: string | null
          author_id: string | null
          blocks: number
          blurb: string | null
          created_at: string
          document: Json
          forked_from: string | null
          id: string
          name: string
          origin: string
          placements: number
          poster: string | null
          report_counts: Json
          seed_key: string | null
          tags: string[]
          tenant_id: string | null
          updated_at: string
          uses: number
          views: number
          visibility: string
        }
        Insert: {
          approved_at?: string | null
          author_id?: string | null
          blocks?: number
          blurb?: string | null
          created_at?: string
          document: Json
          forked_from?: string | null
          id?: string
          name: string
          origin: string
          placements?: number
          poster?: string | null
          report_counts?: Json
          seed_key?: string | null
          tags?: string[]
          tenant_id?: string | null
          updated_at?: string
          uses?: number
          views?: number
          visibility?: string
        }
        Update: {
          approved_at?: string | null
          author_id?: string | null
          blocks?: number
          blurb?: string | null
          created_at?: string
          document?: Json
          forked_from?: string | null
          id?: string
          name?: string
          origin?: string
          placements?: number
          poster?: string | null
          report_counts?: Json
          seed_key?: string | null
          tags?: string[]
          tenant_id?: string | null
          updated_at?: string
          uses?: number
          views?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_worlds_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "published_worlds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_worlds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_worlds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          at_seconds: number
          attempts: number
          claimed_at: string | null
          created_at: string
          document: Json
          error: string | null
          finished_at: string | null
          height: number
          id: string
          requested_by: string | null
          scene_id: string | null
          source: string
          status: string
          storage_path: string | null
          tenant_id: string | null
          width: number
        }
        Insert: {
          at_seconds?: number
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          document: Json
          error?: string | null
          finished_at?: string | null
          height: number
          id?: string
          requested_by?: string | null
          scene_id?: string | null
          source: string
          status?: string
          storage_path?: string | null
          tenant_id?: string | null
          width: number
        }
        Update: {
          at_seconds?: number
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          document?: Json
          error?: string | null
          finished_at?: string | null
          height?: number
          id?: string
          requested_by?: string | null
          scene_id?: string | null
          source?: string
          status?: string
          storage_path?: string | null
          tenant_id?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "published_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      render_servers: {
        Row: {
          created_at: string
          deadline_at: string
          destroyed_at: string | null
          error: string | null
          hcloud_id: number | null
          id: string
          ip: string | null
          location: string
          purpose: string
          requested_by: string | null
          server_type: string
          status: string
        }
        Insert: {
          created_at?: string
          deadline_at: string
          destroyed_at?: string | null
          error?: string | null
          hcloud_id?: number | null
          id?: string
          ip?: string | null
          location: string
          purpose: string
          requested_by?: string | null
          server_type: string
          status?: string
        }
        Update: {
          created_at?: string
          deadline_at?: string
          destroyed_at?: string | null
          error?: string | null
          hcloud_id?: number | null
          id?: string
          ip?: string | null
          location?: string
          purpose?: string
          requested_by?: string | null
          server_type?: string
          status?: string
        }
        Relationships: []
      }
      room_door_charges: {
        Row: {
          created_at: string
          day: string
          paid: number
          room_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          paid: number
          room_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          paid?: number
          room_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      room_marks: {
        Row: {
          pinned_at: string | null
          room_id: string
          seen_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          pinned_at?: string | null
          room_id: string
          seen_at?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          pinned_at?: string | null
          room_id?: string
          seen_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_marks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_marks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      room_perf_samples: {
        Row: {
          channel_state: string
          conn: string
          frame_p50_ms: number | null
          frame_p95_ms: number | null
          frames: number
          hidden_ms: number
          id: string
          link_delay_ms: number | null
          link_jitter_ms: number | null
          peers: number
          quiet_ms: number | null
          received: Json
          reconnects: number
          recv_total: number
          rest_fallback: boolean
          room_kind: string
          rtt_lost: number
          rtt_p50_ms: number | null
          rtt_p95_ms: number | null
          rtt_samples: number
          sampled_at: string
          sent: Json
          sent_total: number
          tenant_id: string
          topic: string
          user_id: string
          window_ms: number
        }
        Insert: {
          channel_state: string
          conn: string
          frame_p50_ms?: number | null
          frame_p95_ms?: number | null
          frames?: number
          hidden_ms?: number
          id?: string
          link_delay_ms?: number | null
          link_jitter_ms?: number | null
          peers?: number
          quiet_ms?: number | null
          received?: Json
          reconnects?: number
          recv_total?: number
          rest_fallback?: boolean
          room_kind: string
          rtt_lost?: number
          rtt_p50_ms?: number | null
          rtt_p95_ms?: number | null
          rtt_samples?: number
          sampled_at?: string
          sent?: Json
          sent_total?: number
          tenant_id: string
          topic: string
          user_id: string
          window_ms: number
        }
        Update: {
          channel_state?: string
          conn?: string
          frame_p50_ms?: number | null
          frame_p95_ms?: number | null
          frames?: number
          hidden_ms?: number
          id?: string
          link_delay_ms?: number | null
          link_jitter_ms?: number | null
          peers?: number
          quiet_ms?: number | null
          received?: Json
          reconnects?: number
          recv_total?: number
          rest_fallback?: boolean
          room_kind?: string
          rtt_lost?: number
          rtt_p50_ms?: number | null
          rtt_p95_ms?: number | null
          rtt_samples?: number
          sampled_at?: string
          sent?: Json
          sent_total?: number
          tenant_id?: string
          topic?: string
          user_id?: string
          window_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_perf_samples_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_perf_samples_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms_read_model: {
        Row: {
          cap: number | null
          closed: boolean
          created_at: string
          created_by: string | null
          door_price: number
          guest_build: boolean
          mode: string
          name: string
          pinned_at: string | null
          room_group: string | null
          room_icon: string | null
          room_id: string
          room_tint: string | null
          round_started_at: string | null
          slug: string
          tenant_id: string
          updated_at: string
          version: number
          visibility: string
          xp_ref: string | null
        }
        Insert: {
          cap?: number | null
          closed?: boolean
          created_at?: string
          created_by?: string | null
          door_price?: number
          guest_build?: boolean
          mode?: string
          name: string
          pinned_at?: string | null
          room_group?: string | null
          room_icon?: string | null
          room_id: string
          room_tint?: string | null
          round_started_at?: string | null
          slug: string
          tenant_id: string
          updated_at?: string
          version?: number
          visibility?: string
          xp_ref?: string | null
        }
        Update: {
          cap?: number | null
          closed?: boolean
          created_at?: string
          created_by?: string | null
          door_price?: number
          guest_build?: boolean
          mode?: string
          name?: string
          pinned_at?: string | null
          room_group?: string | null
          room_icon?: string | null
          room_id?: string
          room_tint?: string | null
          round_started_at?: string | null
          slug?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          visibility?: string
          xp_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      skin_gifts: {
        Row: {
          bought_by: string
          claimed_at: string | null
          claimed_by: string | null
          code: string
          created_at: string
          id: string
          message: string
          skin_id: string
        }
        Insert: {
          bought_by: string
          claimed_at?: string | null
          claimed_by?: string | null
          code: string
          created_at?: string
          id?: string
          message?: string
          skin_id: string
        }
        Update: {
          bought_by?: string
          claimed_at?: string | null
          claimed_by?: string | null
          code?: string
          created_at?: string
          id?: string
          message?: string
          skin_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skin_gifts_skin_id_fkey"
            columns: ["skin_id"]
            isOneToOne: false
            referencedRelation: "skins"
            referencedColumns: ["id"]
          },
        ]
      }
      skin_ownership: {
        Row: {
          created_at: string
          skin_id: string
          user_id: string
          via: string
        }
        Insert: {
          created_at?: string
          skin_id: string
          user_id: string
          via: string
        }
        Update: {
          created_at?: string
          skin_id?: string
          user_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "skin_ownership_skin_id_fkey"
            columns: ["skin_id"]
            isOneToOne: false
            referencedRelation: "skins"
            referencedColumns: ["id"]
          },
        ]
      }
      skin_vouchers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          owner_id: string | null
          promo_redemption_id: string | null
          promo_seq: number | null
          redeemed_at: string | null
          source: string
          spent_at: string | null
          spent_on: string | null
          stripe_invoice_id: string | null
          stripe_session_id: string | null
          stripe_session_seq: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string | null
          promo_redemption_id?: string | null
          promo_seq?: number | null
          redeemed_at?: string | null
          source: string
          spent_at?: string | null
          spent_on?: string | null
          stripe_invoice_id?: string | null
          stripe_session_id?: string | null
          stripe_session_seq?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string | null
          promo_redemption_id?: string | null
          promo_seq?: number | null
          redeemed_at?: string | null
          source?: string
          spent_at?: string | null
          spent_on?: string | null
          stripe_invoice_id?: string | null
          stripe_session_id?: string | null
          stripe_session_seq?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "skin_vouchers_promo_redemption_id_fkey"
            columns: ["promo_redemption_id"]
            isOneToOne: false
            referencedRelation: "promo_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skin_vouchers_spent_on_fkey"
            columns: ["spent_on"]
            isOneToOne: false
            referencedRelation: "skins"
            referencedColumns: ["id"]
          },
        ]
      }
      skins: {
        Row: {
          active: boolean
          backstory: string
          created_at: string
          id: string
          name: string
          price_cents: number
          tier: string
          updated_at: string
          voucher_cost: number
        }
        Insert: {
          active?: boolean
          backstory?: string
          created_at?: string
          id: string
          name: string
          price_cents?: number
          tier?: string
          updated_at?: string
          voucher_cost?: number
        }
        Update: {
          active?: boolean
          backstory?: string
          created_at?: string
          id?: string
          name?: string
          price_cents?: number
          tier?: string
          updated_at?: string
          voucher_cost?: number
        }
        Relationships: []
      }
      space_avatars: {
        Row: {
          model: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          model: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          model?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_avatars_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_avatars_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      space_bank_read_model: {
        Row: {
          coins: number
          created_at: string
          paid_out: number
          stream_id: string
          taken: number
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          coins?: number
          created_at?: string
          paid_out?: number
          stream_id: string
          taken?: number
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          coins?: number
          created_at?: string
          paid_out?: number
          stream_id?: string
          taken?: number
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_bank_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_bank_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      space_challenges: {
        Row: {
          battle_id: string | null
          challenged_tenant_id: string
          challenger_tenant_id: string
          created_at: string
          created_by: string | null
          damage_on: boolean | null
          duration_minutes: number | null
          id: string
          message: string | null
          mode: string
          respawn_on: boolean | null
          responded_at: string | null
          score_limit: number | null
          status: string
          world_id: string
        }
        Insert: {
          battle_id?: string | null
          challenged_tenant_id: string
          challenger_tenant_id: string
          created_at?: string
          created_by?: string | null
          damage_on?: boolean | null
          duration_minutes?: number | null
          id?: string
          message?: string | null
          mode: string
          respawn_on?: boolean | null
          responded_at?: string | null
          score_limit?: number | null
          status?: string
          world_id: string
        }
        Update: {
          battle_id?: string | null
          challenged_tenant_id?: string
          challenger_tenant_id?: string
          created_at?: string
          created_by?: string | null
          damage_on?: boolean | null
          duration_minutes?: number | null
          id?: string
          message?: string | null
          mode?: string
          respawn_on?: boolean | null
          responded_at?: string | null
          score_limit?: number | null
          status?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_challenges_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battles_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_challenges_challenged_tenant_id_fkey"
            columns: ["challenged_tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_challenges_challenged_tenant_id_fkey"
            columns: ["challenged_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_challenges_challenger_tenant_id_fkey"
            columns: ["challenger_tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_challenges_challenger_tenant_id_fkey"
            columns: ["challenger_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      space_extras: {
        Row: {
          bought: number
          key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bought?: number
          key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bought?: number
          key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_extras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_extras_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      space_radio: {
        Row: {
          place: string | null
          playing: boolean
          position_ms: number
          scope: string
          started_at: string | null
          tenant_id: string
          title: string | null
          track_url: string | null
          updated_at: string
          version: number
        }
        Insert: {
          place?: string | null
          playing?: boolean
          position_ms?: number
          scope?: string
          started_at?: string | null
          tenant_id: string
          title?: string | null
          track_url?: string | null
          updated_at: string
          version: number
        }
        Update: {
          place?: string | null
          playing?: boolean
          position_ms?: number
          scope?: string
          started_at?: string | null
          tenant_id?: string
          title?: string | null
          track_url?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_radio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_radio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions_read_model: {
        Row: {
          amount_cents: number | null
          cancel_at_period_end: boolean
          created_at: string
          currency: string | null
          current_period_end: string | null
          last_failure_reason: string | null
          pending_tier: string | null
          pending_tier_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          tier: string | null
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents?: number | null
          cancel_at_period_end?: boolean
          created_at: string
          currency?: string | null
          current_period_end?: string | null
          last_failure_reason?: string | null
          pending_tier?: string | null
          pending_tier_at?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          tier?: string | null
          updated_at: string
          version: number
        }
        Update: {
          amount_cents?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          last_failure_reason?: string | null
          pending_tier?: string | null
          pending_tier_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          tier?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      tasks_read_model: {
        Row: {
          completed: boolean
          created_at: string
          created_by: string | null
          deleted: boolean
          id: string
          tenant_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          completed?: boolean
          created_at: string
          created_by?: string | null
          deleted?: boolean
          id: string
          tenant_id: string
          title: string
          updated_at: string
          version: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      tenant_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          display_name: string | null
          guest_id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          display_name?: string | null
          guest_id: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          display_name?: string | null
          guest_id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_bans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_bans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_event_sequences: {
        Row: {
          last_seq: number
          tenant_id: string
        }
        Insert: {
          last_seq: number
          tenant_id: string
        }
        Update: {
          last_seq?: number
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_guests: {
        Row: {
          admitted_at: string | null
          avatar: string | null
          display_name: string
          expires_at: string
          guest_id: string
          joined_at: string
          link_id: string | null
          tenant_id: string
        }
        Insert: {
          admitted_at?: string | null
          avatar?: string | null
          display_name: string
          expires_at: string
          guest_id: string
          joined_at?: string
          link_id?: string | null
          tenant_id: string
        }
        Update: {
          admitted_at?: string | null
          avatar?: string | null
          display_name?: string
          expires_at?: string
          guest_id?: string
          joined_at?: string
          link_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_guests_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "guest_links"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitation_emails: {
        Row: {
          created_at: string
          email: string
          invitee_key: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email: string
          invitee_key: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          email?: string
          invitee_key?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_invitations: {
        Row: {
          invited_at: string
          invited_by: string
          invited_user_id: string | null
          invitee_key: string
          role: string
          tenant_id: string
        }
        Insert: {
          invited_at: string
          invited_by: string
          invited_user_id?: string | null
          invitee_key: string
          role: string
          tenant_id: string
        }
        Update: {
          invited_at?: string
          invited_by?: string
          invited_user_id?: string | null
          invitee_key?: string
          role?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          joined_at: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          joined_at: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_slugs: {
        Row: {
          claimed_at: string
          claimed_by: string | null
          slug: string
          tenant_id: string
        }
        Insert: {
          claimed_at?: string
          claimed_by?: string | null
          slug: string
          tenant_id: string
        }
        Update: {
          claimed_at?: string
          claimed_by?: string | null
          slug?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tenants_read_model: {
        Row: {
          archived: boolean
          capabilities: Json
          chat_enabled: boolean
          created_at: string
          id: string
          is_public_lounge: boolean
          lounge_mode: string
          name: string
          needs: Json
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          archived?: boolean
          capabilities?: Json
          chat_enabled?: boolean
          created_at: string
          id: string
          is_public_lounge?: boolean
          lounge_mode?: string
          name: string
          needs?: Json
          slug: string
          updated_at: string
          version: number
        }
        Update: {
          archived?: boolean
          capabilities?: Json
          chat_enabled?: boolean
          created_at?: string
          id?: string
          is_public_lounge?: boolean
          lounge_mode?: string
          name?: string
          needs?: Json
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      thing_kills: {
        Row: {
          created_at: string
          paid: number
          tenant_id: string
          thing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          paid: number
          tenant_id: string
          thing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          paid?: number
          tenant_id?: string
          thing_id?: string
          user_id?: string
        }
        Relationships: []
      }
      thingiverse_blueprints_read_model: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          retired: boolean
          spec: Json
          tenant_id: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          created_at: string
          id: string
          name: string
          owner_id: string
          retired?: boolean
          spec: Json
          tenant_id: string
          updated_at: string
          version: number
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          retired?: boolean
          spec?: Json
          tenant_id?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: []
      }
      thingiverse_clips_read_model: {
        Row: {
          clip: Json
          created_at: string
          doc: Json | null
          id: string
          name: string
          owner_id: string
          retired: boolean
          skeleton: string
          tenant_id: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          clip: Json
          created_at: string
          doc?: Json | null
          id: string
          name: string
          owner_id: string
          retired?: boolean
          skeleton: string
          tenant_id: string
          updated_at: string
          version: number
          visibility?: string
        }
        Update: {
          clip?: Json
          created_at?: string
          doc?: Json | null
          id?: string
          name?: string
          owner_id?: string
          retired?: boolean
          skeleton?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: []
      }
      thingiverse_emotes_read_model: {
        Row: {
          by_id: string | null
          tenant_id: string
          tree: Json
          updated_at: string
          version: number
        }
        Insert: {
          by_id?: string | null
          tenant_id: string
          tree?: Json
          updated_at: string
          version: number
        }
        Update: {
          by_id?: string | null
          tenant_id?: string
          tree?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      thingiverse_things_read_model: {
        Row: {
          blueprint_id: string
          created_at: string
          deleted: boolean
          facing: number
          id: string
          keep: boolean
          placed_by: string | null
          scale: number
          tenant_id: string
          tuning: Json
          updated_at: string
          version: number
          world_id: string
          x: number
          y: number
          z: number
        }
        Insert: {
          blueprint_id: string
          created_at: string
          deleted?: boolean
          facing?: number
          id: string
          keep?: boolean
          placed_by?: string | null
          scale?: number
          tenant_id: string
          tuning?: Json
          updated_at: string
          version: number
          world_id: string
          x: number
          y: number
          z: number
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          deleted?: boolean
          facing?: number
          id?: string
          keep?: boolean
          placed_by?: string | null
          scale?: number
          tenant_id?: string
          tuning?: Json
          updated_at?: string
          version?: number
          world_id?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      tier_prices: {
        Row: {
          created_at: string
          limits: Json
          note: string | null
          price_id: string
          provider: string
          sold: boolean
          tier: string
        }
        Insert: {
          created_at?: string
          limits?: Json
          note?: string | null
          price_id: string
          provider?: string
          sold?: boolean
          tier: string
        }
        Update: {
          created_at?: string
          limits?: Json
          note?: string | null
          price_id?: string
          provider?: string
          sold?: boolean
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_prices_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tiers: {
        Row: {
          cents: number
          id: string
          label: string
          limits: Json
          rank: number
          shown_on_landing: boolean
          sold: boolean
          tagline: string
          updated_at: string
        }
        Insert: {
          cents: number
          id: string
          label: string
          limits?: Json
          rank: number
          shown_on_landing?: boolean
          sold?: boolean
          tagline: string
          updated_at?: string
        }
        Update: {
          cents?: number
          id?: string
          label?: string
          limits?: Json
          rank?: number
          shown_on_landing?: boolean
          sold?: boolean
          tagline?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournaments_read_model: {
        Row: {
          created_at: string
          created_by: string | null
          ended_at: string | null
          entrants: number
          id: string
          mode: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          winner_id: string | null
          world_id: string
          xp_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          entrants?: number
          id: string
          mode: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          winner_id?: string | null
          world_id: string
          xp_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          entrants?: number
          id?: string
          mode?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          winner_id?: string | null
          world_id?: string
          xp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          checksum: string
          created_at: string
          mime: string
          page_id: string | null
          scan_status: string
          size_bytes: number
          slug: string
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          checksum: string
          created_at?: string
          mime: string
          page_id?: string | null
          scan_status?: string
          size_bytes: number
          slug: string
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          checksum?: string
          created_at?: string
          mime?: string
          page_id?: string | null
          scan_status?: string
          size_bytes?: number
          slug?: string
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          price_id: string | null
          seats: number
          status: string
          stripe_customer_id: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          price_id?: string | null
          seats?: number
          status?: string
          stripe_customer_id?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          price_id?: string | null
          seats?: number
          status?: string
          stripe_customer_id?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          chosen_at: string | null
          created_at: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          chosen_at?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          chosen_at?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      voucher_claims: {
        Row: {
          coins: number
          created_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          coins: number
          created_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance: number
          created_at: string
          id: string
          tenant_id: string | null
          transfer: string
          user_id: string
        }
        Insert: {
          amount: number
          balance: number
          created_at?: string
          id?: string
          tenant_id?: string | null
          transfer: string
          user_id: string
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          id?: string
          tenant_id?: string | null
          transfer?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          coins: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coins?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coins?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      world_copies: {
        Row: {
          created_at: string
          source_world_id: string
          tenant_id: string
          world_id: string
        }
        Insert: {
          created_at?: string
          source_world_id: string
          tenant_id: string
          world_id: string
        }
        Update: {
          created_at?: string
          source_world_id?: string
          tenant_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_copies_source_world_id_fkey"
            columns: ["source_world_id"]
            isOneToOne: false
            referencedRelation: "published_worlds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_copies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_copies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      world_favourites: {
        Row: {
          created_at: string
          user_id: string
          world_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          world_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_favourites_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "published_worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      world_occupancy: {
        Row: {
          seen_at: string
          tenant_id: string
          user_id: string
          world_id: string
        }
        Insert: {
          seen_at?: string
          tenant_id: string
          user_id: string
          world_id: string
        }
        Update: {
          seen_at?: string
          tenant_id?: string
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_occupancy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_occupancy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      world_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: string | null
          world_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
          world_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_reports_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "battlefields_read_model"
            referencedColumns: ["world_id"]
          },
        ]
      }
      world_spawns: {
        Row: {
          show_ring: boolean
          tenant_id: string
          updated_at: string
          world_id: string
          x: number
          y: number | null
          z: number
        }
        Insert: {
          show_ring?: boolean
          tenant_id: string
          updated_at?: string
          world_id: string
          x: number
          y?: number | null
          z: number
        }
        Update: {
          show_ring?: boolean
          tenant_id?: string
          updated_at?: string
          world_id?: string
          x?: number
          y?: number | null
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_spawns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_spawns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_arbiter_state: {
        Row: {
          created_at: string
          instance: string
          state: Json
          updated_at: string
          xp_id: string | null
        }
        Insert: {
          created_at?: string
          instance: string
          state?: Json
          updated_at?: string
          xp_id?: string | null
        }
        Update: {
          created_at?: string
          instance?: string
          state?: Json
          updated_at?: string
          xp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xp_arbiter_state_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_claims: {
        Row: {
          claimed_at: string
          expires_at: string
          held_by: string
          xp_id: string
        }
        Insert: {
          claimed_at?: string
          expires_at: string
          held_by: string
          xp_id: string
        }
        Update: {
          claimed_at?: string
          expires_at?: string
          held_by?: string
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_claims_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: true
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_files: {
        Row: {
          bytes: number
          created_at: string
          ext: string
          mime: string
          scan_status: string
          sha: string
          tenant_id: string
        }
        Insert: {
          bytes: number
          created_at?: string
          ext: string
          mime: string
          scan_status?: string
          sha: string
          tenant_id: string
        }
        Update: {
          bytes?: number
          created_at?: string
          ext?: string
          mime?: string
          scan_status?: string
          sha?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_grants: {
        Row: {
          account_id: string
          created_at: string
          granted_by: string | null
          right: string
          xp_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          granted_by?: string | null
          right: string
          xp_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          granted_by?: string | null
          right?: string
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_grants_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_purchases: {
        Row: {
          account_id: string
          created_at: string
          paid: number
          tenant_id: string
          xp_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          paid: number
          tenant_id: string
          xp_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          paid?: number
          tenant_id?: string
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_purchases_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_releases: {
        Row: {
          released_at: string
          released_by: string | null
          version: number
          withdrawn_at: string | null
          withdrawn_reason: string | null
          xp_id: string
        }
        Insert: {
          released_at?: string
          released_by?: string | null
          version: number
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
          xp_id: string
        }
        Update: {
          released_at?: string
          released_by?: string | null
          version?: number
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_releases_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_sessions: {
        Row: {
          account_id: string | null
          ended_at: string
          id: string
          instance: string | null
          outcome: string
          seconds: number
          started_at: string
          xp_ref: string
        }
        Insert: {
          account_id?: string | null
          ended_at?: string
          id?: string
          instance?: string | null
          outcome: string
          seconds: number
          started_at: string
          xp_ref: string
        }
        Update: {
          account_id?: string | null
          ended_at?: string
          id?: string
          instance?: string | null
          outcome?: string
          seconds?: number
          started_at?: string
          xp_ref?: string
        }
        Relationships: []
      }
      xp_store: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          scope: string
          updated_at: string
          value: Json
          xp_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          scope: string
          updated_at?: string
          value?: Json
          xp_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          scope?: string
          updated_at?: string
          value?: Json
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_store_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_streams: {
        Row: {
          account_id: string | null
          at: string
          data: Json
          id: string
          ordinal: number
          stream: string
          type: string
          xp_id: string
        }
        Insert: {
          account_id?: string | null
          at?: string
          data?: Json
          id?: string
          ordinal?: never
          stream: string
          type: string
          xp_id: string
        }
        Update: {
          account_id?: string | null
          at?: string
          data?: Json
          id?: string
          ordinal?: never
          stream?: string
          type?: string
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_streams_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_versions: {
        Row: {
          bytes: number
          created_at: string
          created_by: string | null
          document: Json
          files: number
          manifest: Json
          version: number
          xp_id: string
        }
        Insert: {
          bytes?: number
          created_at?: string
          created_by?: string | null
          document: Json
          files?: number
          manifest: Json
          version: number
          xp_id: string
        }
        Update: {
          bytes?: number
          created_at?: string
          created_by?: string | null
          document?: Json
          files?: number
          manifest?: Json
          version?: number
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_versions_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_visits: {
        Row: {
          at: string
          owner_id: string
          visitor_id: string
          xp_id: string
        }
        Insert: {
          at?: string
          owner_id: string
          visitor_id: string
          xp_id: string
        }
        Update: {
          at?: string
          owner_id?: string
          visitor_id?: string
          xp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_visits_xp_id_fkey"
            columns: ["xp_id"]
            isOneToOne: false
            referencedRelation: "xps_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
      xps_read_model: {
        Row: {
          blurb: string | null
          bytes: number
          copied_from: string | null
          cover_path: string | null
          created_at: string
          current_version: number
          id: string
          name: string
          owner_id: string | null
          price_once: number
          price_remix: number
          price_split: Json | null
          published_version: number | null
          space_policy: string
          state: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          blurb?: string | null
          bytes?: number
          copied_from?: string | null
          cover_path?: string | null
          created_at?: string
          current_version?: number
          id: string
          name: string
          owner_id?: string | null
          price_once?: number
          price_remix?: number
          price_split?: Json | null
          published_version?: number | null
          space_policy?: string
          state?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          blurb?: string | null
          bytes?: number
          copied_from?: string | null
          cover_path?: string | null
          created_at?: string
          current_version?: number
          id?: string
          name?: string
          owner_id?: string | null
          price_once?: number
          price_remix?: number
          price_split?: Json | null
          published_version?: number | null
          space_policy?: string
          state?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "xps_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "backoffice_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xps_read_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants_read_model"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      backoffice_workspaces: {
        Row: {
          archived: boolean | null
          created_at: string | null
          id: string | null
          member_count: number | null
          name: string | null
          owner_username: string | null
          pending_invitations: number | null
          slug: string | null
        }
        Insert: {
          archived?: boolean | null
          created_at?: string | null
          id?: string | null
          member_count?: never
          name?: string | null
          owner_username?: never
          pending_invitations?: never
          slug?: string | null
        }
        Update: {
          archived?: boolean | null
          created_at?: string | null
          id?: string | null
          member_count?: never
          name?: string | null
          owner_username?: never
          pending_invitations?: never
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_feature_limit: {
        Args: { p_key: string }
        Returns: {
          ceiling_value: number
          has_override: boolean
          override_value: number
        }[]
      }
      account_has_had_tier: {
        Args: { p_tier: string; p_user_id: string }
        Returns: boolean
      }
      append_events: {
        Args: {
          p_events: Json
          p_expected_version: number
          p_stream_id: string
          p_stream_type: string
          p_tenant_id: string
        }
        Returns: {
          actor_id: string | null
          created_at: string
          data: Json
          global_seq: number
          metadata: Json
          stream_id: string
          stream_type: string
          tenant_id: string
          tenant_seq: number
          type: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      approve_world_from_match: {
        Args: { p_world_id: string }
        Returns: boolean
      }
      author_is_blocked: { Args: { p_author_id: string }; Returns: boolean }
      backoffice_section_level: { Args: { p_section: string }; Returns: string }
      battle_payout_claim: {
        Args: { p_battle_id: string; p_phase: string; p_tenant: string }
        Returns: boolean
      }
      battle_topic_id: { Args: { p_topic: string }; Returns: string }
      can_act_in_battle: {
        Args: { p_battle_id: string; p_user_id: string }
        Returns: boolean
      }
      can_enter_room: { Args: { p_room_id: string }; Returns: boolean }
      channel_show_role: { Args: { p_show_id: string }; Returns: string }
      chat_message_hidden: { Args: { p_message_id: string }; Returns: boolean }
      chat_room_topic_tenant: { Args: { p_topic: string }; Returns: string }
      chat_room_topic_world: { Args: { p_topic: string }; Returns: string }
      chat_topic_tenant: { Args: { p_topic: string }; Returns: string }
      claim_event_machine: {
        Args: { p_agent: string; p_stale?: string; p_wanted?: string[] }
        Returns: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          error: string | null
          guest_url: string | null
          ip: string | null
          log: string
          requested_by: string | null
          server_id: number | null
          server_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "event_machines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_free_month: {
        Args: { p_source?: string; p_tenant_id?: string; p_user_id: string }
        Returns: {
          granted_tier: string
          granted_until: string
          outcome: string
        }[]
      }
      claim_free_skin: {
        Args: { p_skin_id: string; p_user_id: string }
        Returns: string
      }
      claim_render_job: {
        Args: { p_max_attempts?: number }
        Returns: {
          at_seconds: number
          attempts: number
          claimed_at: string | null
          created_at: string
          document: Json
          error: string | null
          finished_at: string | null
          height: number
          id: string
          requested_by: string | null
          scene_id: string | null
          source: string
          status: string
          storage_path: string | null
          tenant_id: string | null
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "render_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_skin_gift: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
      }
      claim_username: {
        Args: { p_seed: string; p_user_id: string }
        Returns: string
      }
      claim_xp: {
        Args: { p_account: string; p_seconds: number; p_xp_id: string }
        Returns: {
          claimed_at: string
          expires_at: string
          held_by: string
          xp_id: string
        }
        SetofOptions: {
          from: "*"
          to: "xp_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      error_report_groups: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          affected: number
          digest: string
          fingerprint: string
          first_seen: string
          last_seen: string
          message: string
          occurrences: number
          open_count: number
          path: string
          route: string
          source: string
          stack: string
        }[]
      }
      event_guest_may_build: {
        Args: { p_tenant_id: string; p_world_id: string }
        Returns: boolean
      }
      event_guest_may_write: {
        Args: { p_stream_type: string; p_tenant_id: string }
        Returns: boolean
      }
      event_links_ok: { Args: { p_links: Json }; Returns: boolean }
      event_open: { Args: { p_tenant_id: string }; Returns: boolean }
      events_since_checkpoint: {
        Args: { p_limit?: number; p_projection: string; p_tenant_id: string }
        Returns: {
          actor_id: string
          created_at: string
          data: Json
          global_seq: number
          last_seq: number
          metadata: Json
          stream_id: string
          stream_type: string
          tenant_id: string
          tenant_seq: number
          type: string
          version: number
        }[]
      }
      experiment_report: { Args: { days?: number }; Returns: Json }
      experiment_report_admin: { Args: { days?: number }; Returns: Json }
      forget_invitation: {
        Args: { p_invitee_key: string; p_tenant_id: string }
        Returns: undefined
      }
      funnel_report: { Args: { days?: number; steps: Json }; Returns: Json }
      funnel_report_admin: {
        Args: { days?: number; steps: Json }
        Returns: Json
      }
      gift_skin: {
        Args: {
          p_code: string
          p_message?: string
          p_skin_id: string
          p_user_id: string
        }
        Returns: string
      }
      gift_skin_voucher: {
        Args: { p_code: string; p_user_id: string; p_voucher_id: string }
        Returns: string
      }
      grant_covers_tenant: {
        Args: { p_spaces: number; p_tenant_id: string; p_user_id: string }
        Returns: boolean
      }
      hall_topic_room: { Args: { p_topic: string }; Returns: string }
      has_password: { Args: never; Returns: boolean }
      has_tenant_invitation: { Args: { p_tenant_id: string }; Returns: boolean }
      has_xp_grant: { Args: { p_xp_id: string }; Returns: boolean }
      health_db_stats: {
        Args: never
        Returns: {
          connections: number
          db_size_bytes: number
          max_conns: number
          tables: Json
        }[]
      }
      health_prune: { Args: { p_keep_days?: number }; Returns: number }
      health_realtime_limits: {
        Args: never
        Returns: {
          external_id: string
          max_bytes_per_second: number
          max_channels_per_client: number
          max_concurrent_users: number
          max_events_per_second: number
          max_joins_per_second: number
          updated_at: string
        }[]
      }
      health_series: {
        Args: { p_hours?: number; p_limit?: number }
        Returns: {
          build_id: string
          db_connections: number
          db_size_bytes: number
          deps: Json
          disk_free_bytes: number
          disk_total_bytes: number
          errors_delta: number
          event_loop_lag_ms: number
          heap_used_bytes: number
          replica: string
          requests_delta: number
          rss_bytes: number
          sampled_at: string
          status: string
          uptime_seconds: number
        }[]
      }
      host_prune: { Args: { p_keep_days?: number }; Returns: number }
      host_series: {
        Args: { p_hours?: number; p_limit?: number }
        Returns: {
          cpu_busy: number
          cpu_cores: number
          disk_free_bytes: number
          disk_total_bytes: number
          host: string
          hostname: string
          load1: number
          load15: number
          load5: number
          mem_available_bytes: number
          mem_total_bytes: number
          sampled_at: string
          swap_free_bytes: number
          swap_total_bytes: number
          uptime_seconds: number
        }[]
      }
      invitation_is_mine: {
        Args: { p_invitee_key: string; p_tenant_id: string }
        Returns: boolean
      }
      invitation_role: {
        Args: { p_invitee_key: string; p_tenant_id: string }
        Returns: string
      }
      is_backoffice_admin: { Args: never; Returns: boolean }
      is_backoffice_user: { Args: never; Returns: boolean }
      is_battle_participant: {
        Args: { p_battle_id: string; p_user_id: string }
        Returns: boolean
      }
      is_guest_banned: {
        Args: { p_guest_id: string; p_tenant_id: string }
        Returns: boolean
      }
      is_tenant_guest: { Args: { p_tenant_id: string }; Returns: boolean }
      is_tenant_member: { Args: { p_tenant_id: string }; Returns: boolean }
      log_event_machine: {
        Args: { p_line: string; p_tenant_id: string }
        Returns: undefined
      }
      lookup_invitee_by_email: {
        Args: { p_email: string; p_tenant_id: string }
        Returns: string
      }
      lookup_invitee_by_username: {
        Args: { p_tenant_id: string; p_username: string }
        Returns: string
      }
      lounge_topic_tenant: { Args: { p_topic: string }; Returns: string }
      maumau_arbitrate: {
        Args: {
          p_action: string
          p_caller: string
          p_instance: string
          p_payload: Json
          p_state: Json
        }
        Returns: Json
      }
      maumau_draw: {
        Args: {
          p_count: number
          p_discard: Json
          p_hands: Json
          p_pile: Json
          p_seat: string
        }
        Returns: {
          discard: Json
          hands: Json
          pile: Json
        }[]
      }
      maumau_letter: { Args: { p_suit: string }; Returns: string }
      maumau_outcome: { Args: { p_at: number; p_game: Json }; Returns: Json }
      maumau_seat_after: {
        Args: {
          p_by: number
          p_direction: number
          p_seats: number
          p_turn: number
        }
        Returns: number
      }
      maumau_seen: { Args: { p_caller: string; p_game: Json }; Returns: Json }
      maumau_settle: {
        Args: {
          p_declared: boolean
          p_said: Json
          p_seat: string
          p_size: number
        }
        Returns: Json
      }
      may_read_xp: { Args: { p_xp_id: string }; Returns: boolean }
      may_read_xp_version: {
        Args: { p_version: number; p_xp_id: string }
        Returns: boolean
      }
      mint_buck_code: { Args: never; Returns: string }
      my_pending_invitations: {
        Args: never
        Returns: {
          invited_at: string
          invitee_key: string
          role: string
          tenant_id: string
        }[]
      }
      my_tenant_invitation: { Args: { p_tenant_id: string }; Returns: string }
      occupancy_ttl: { Args: never; Returns: string }
      page_frequency: { Args: never; Returns: Json }
      page_view_report: { Args: { days?: number }; Returns: Json }
      path_template: { Args: { p_path: string }; Returns: string }
      projection_sweep_history: {
        Args: { p_hours?: number }
        Returns: {
          applied: number
          errors: Json | null
          failed: number
          id: number
          ms: number
          pending: number
          projections: number
          ran_at: string
          remaining: number
          spaces: number
          swept: number
        }[]
        SetofOptions: {
          from: "*"
          to: "projection_sweeps"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      radio_topic_tenant: { Args: { p_topic: string }; Returns: string }
      reap_expired_guests: { Args: { p_grace?: string }; Returns: number }
      reap_stale_occupancy: { Args: { p_grace?: string }; Returns: number }
      record_projection_sweep: {
        Args: {
          p_applied: number
          p_errors?: Json
          p_failed: number
          p_ms: number
          p_pending: number
          p_projections: number
          p_remaining: number
          p_spaces: number
          p_swept: number
        }
        Returns: undefined
      }
      record_room_perf: {
        Args: {
          p_channel_state: string
          p_conn: string
          p_frame_p50_ms?: number
          p_frame_p95_ms?: number
          p_frames?: number
          p_hidden_ms?: number
          p_link_delay_ms?: number
          p_link_jitter_ms?: number
          p_peers?: number
          p_quiet_ms?: number
          p_received?: Json
          p_reconnects?: number
          p_rest_fallback?: boolean
          p_rtt_lost?: number
          p_rtt_p50_ms?: number
          p_rtt_p95_ms?: number
          p_rtt_samples?: number
          p_sent?: Json
          p_tenant_id: string
          p_topic: string
          p_window_ms: number
        }
        Returns: boolean
      }
      record_world_use: { Args: { p_world_id: string }; Returns: undefined }
      record_world_view: { Args: { p_world_id: string }; Returns: undefined }
      recount_battle_scores: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      redeem_promo_code: {
        Args: {
          p_campaign?: string
          p_code: string
          p_ignore_history?: boolean
          p_source?: string
          p_tenant_id?: string
          p_user_id: string
        }
        Returns: {
          code_id: string
          granted_bucks: number
          granted_coins: number
          granted_tier: string
          granted_until: string
          granted_vouchers: number
          outcome: string
          voucher_codes: string[]
        }[]
      }
      redeem_skin_voucher: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
      }
      repair_tenant_event_sequence_heads: {
        Args: never
        Returns: {
          cursors_moved: number
          now_at: number
          tenant_id: string
          was: number
        }[]
      }
      requeue_stale_render_jobs: {
        Args: { p_older_than?: string }
        Returns: number
      }
      resolve_features: { Args: { p_tenant_id?: string }; Returns: Json }
      room_cap: {
        Args: { p_room_id: string; p_tenant_id: string }
        Returns: number
      }
      room_door_claim: {
        Args: {
          p_day: string
          p_price: number
          p_room: string
          p_tenant: string
        }
        Returns: boolean
      }
      room_has_space: {
        Args: { p_room_id: string; p_tenant_id: string }
        Returns: boolean
      }
      room_perf_prune: { Args: { p_keep_days?: number }; Returns: number }
      room_perf_rooms: {
        Args: { p_minutes?: number }
        Returns: {
          clients: number
          delivered_hz: number
          last_seen: string
          people: number
          rest_fallback: boolean
          room_kind: string
          samples: number
          sent_hz: number
          tenant_id: string
          tenant_name: string
          topic: string
          unhealthy: number
          worst_frame_p95_ms: number
          worst_rtt_p95_ms: number
        }[]
      }
      room_topic_tenant: { Args: { p_topic: string }; Returns: string }
      set_event_banner: {
        Args: { p_banner_id: string; p_link_id: string; p_tenant_id: string }
        Returns: boolean
      }
      set_event_header: {
        Args: {
          p_blurb: string
          p_headline: string
          p_links: Json
          p_tenant_id: string
        }
        Returns: boolean
      }
      space_activity: { Args: { days?: number }; Returns: Json }
      space_capability_on: {
        Args: { p_capability: string; p_tenant_id: string }
        Returns: boolean
      }
      space_extra_add: {
        Args: { p_key: string; p_tenant: string }
        Returns: number
      }
      spend_skin_vouchers: {
        Args: { p_skin_id: string; p_user_id: string }
        Returns: string
      }
      stray_guest_ids: {
        Args: { p_limit?: number; p_older_than: string }
        Returns: string[]
      }
      stream_capability: { Args: { p_stream_type: string }; Returns: string }
      stream_tenant: { Args: { p_stream_id: string }; Returns: string }
      suggest_username: { Args: { p_seed: string }; Returns: string }
      summon_topic_tenant: { Args: { p_topic: string }; Returns: string }
      tenant_created_by: { Args: { p_tenant_id: string }; Returns: string }
      tenant_event_permitted: {
        Args: { p_data: Json; p_tenant_id: string; p_type: string }
        Returns: boolean
      }
      tenant_feature_limit: {
        Args: { p_key: string; p_tenant_id?: string }
        Returns: {
          ceiling_value: number
          has_override: boolean
          override_value: number
        }[]
      }
      tenant_guest_count: { Args: { p_tenant_id: string }; Returns: number }
      tenant_guest_limit: { Args: { p_tenant_id?: string }; Returns: number }
      tenant_guests_present: {
        Args: { p_tenant_id: string }
        Returns: {
          admitted_at: string | null
          avatar: string | null
          display_name: string
          expires_at: string
          guest_id: string
          joined_at: string
          link_id: string | null
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenant_guests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      tenant_has_events: { Args: { p_tenant_id: string }; Returns: boolean }
      tenant_is_entitled: { Args: { p_tenant_id: string }; Returns: boolean }
      tenant_is_event: { Args: { p_tenant_id: string }; Returns: boolean }
      tenant_is_unclaimed: { Args: { p_tenant_id: string }; Returns: boolean }
      tenant_role: { Args: { p_tenant_id: string }; Returns: string }
      tenant_seat_limit: { Args: { p_tenant_id?: string }; Returns: number }
      tenant_tier: { Args: { p_tenant_id: string }; Returns: string }
      thing_kill_claim: {
        Args: { p_paid: number; p_tenant: string; p_thing: string }
        Returns: boolean
      }
      things_room_topic_tenant: { Args: { p_topic: string }; Returns: string }
      things_room_topic_world: { Args: { p_topic: string }; Returns: string }
      things_topic_tenant: { Args: { p_topic: string }; Returns: string }
      touch_occupancy: {
        Args: { p_tenant_id: string; p_world_id: string }
        Returns: undefined
      }
      username_seed: { Args: { p_email: string }; Returns: string }
      visitor_profile: {
        Args: { days?: number; p_user_id: string }
        Returns: Json
      }
      visitor_profiles: { Args: { days?: number }; Returns: Json }
      wallet_move: {
        Args: {
          p_amount: number
          p_tenant: string
          p_transfer: string
          p_user: string
        }
        Returns: {
          balance: number
          status: string
        }[]
      }
      world_occupancy_count: {
        Args: { p_tenant_id: string; p_world_id: string }
        Returns: number
      }
      world_topic_open: {
        Args: { p_tenant: string; p_world: string }
        Returns: boolean
      }
      xp_arbiter_tally: { Args: { state: Json }; Returns: Json }
      xp_arbiter_view: { Args: { p_instance: string }; Returns: Json }
      xp_arbitrate: {
        Args: { p_action: string; p_instance: string; p_payload?: Json }
        Returns: Json
      }
      xp_event_permitted: {
        Args: {
          p_data: Json
          p_stream_id: string
          p_tenant_id: string
          p_type: string
        }
        Returns: boolean
      }
      xp_in_my_space: { Args: { p_xp_id: string }; Returns: boolean }
      xp_in_my_space_as_member: { Args: { p_xp_id: string }; Returns: boolean }
      xp_is_mine: { Args: { p_xp_id: string }; Returns: boolean }
      xp_play_totals: {
        Args: { p_prefixes: string[] }
        Returns: {
          last_played: string
          plays: number
          prefix: string
          seconds: number
        }[]
      }
      xp_play_totals_mine: {
        Args: { p_xp_ids: string[] }
        Returns: {
          last_played: string
          plays: number
          seconds: number
          xp_id: string
        }[]
      }
      xp_room_topic: { Args: { p_topic: string }; Returns: string }
      xp_store_clear: {
        Args: { p_everything: boolean; p_xp_id: string }
        Returns: number
      }
      xp_store_overview: {
        Args: { p_tenant: string }
        Returns: {
          bytes: number
          keys: string[]
          last_write: string
          rows: number
          scope: string
          xp_id: string
          xp_name: string
        }[]
      }
      xp_store_put: {
        Args: { p_key: string; p_scope: string; p_value: Json; p_xp: string }
        Returns: undefined
      }
      xp_stream_append: {
        Args: {
          p_data: Json
          p_stream: string
          p_type: string
          p_xp_id: string
        }
        Returns: undefined
      }
      xp_visit: { Args: { p_xp: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

