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
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      booking_addons: {
        Row: {
          addon_id: string | null
          booking_id: string
          created_at: string
          duration_minutes: number
          id: string
          name_snapshot: string
          price_grosz: number
          quantity: number
          salon_id: string
          updated_at: string
        }
        Insert: {
          addon_id?: string | null
          booking_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name_snapshot: string
          price_grosz: number
          quantity?: number
          salon_id: string
          updated_at?: string
        }
        Update: {
          addon_id?: string | null
          booking_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name_snapshot?: string
          price_grosz?: number
          quantity?: number
          salon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "service_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_addons_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          buffer_after_minutes: number
          created_at: string
          duration_minutes: number
          id: string
          item_order: number
          name_snapshot: string
          price_grosz: number
          salon_id: string
          service_id: string | null
        }
        Insert: {
          booking_id: string
          buffer_after_minutes?: number
          created_at?: string
          duration_minutes: number
          id?: string
          item_order?: number
          name_snapshot: string
          price_grosz: number
          salon_id: string
          service_id?: string | null
        }
        Update: {
          booking_id?: string
          buffer_after_minutes?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          item_order?: number
          name_snapshot?: string
          price_grosz?: number
          salon_id?: string
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reviews: {
        Row: {
          booking_id: string
          client_id: string | null
          comment: string | null
          created_at: string
          id: string
          rating: number
          salon_id: string
          salon_replied_at: string | null
          salon_reply: string | null
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          salon_id: string
          salon_replied_at?: string | null
          salon_reply?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          client_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          salon_id?: string
          salon_replied_at?: string | null
          salon_reply?: string | null
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reviews_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reviews_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          comment: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["booking_status"] | null
          id: string
          salon_id: string
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          salon_id: string
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["booking_status"] | null
          id?: string
          salon_id?: string
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          buffer_after_minutes: number
          cancellation_comment: string | null
          client_id: string
          client_note: string | null
          created_at: string
          created_by: string | null
          deposit_grosz: number | null
          ends_at: string
          google_event_id: string | null
          google_synced_at: string | null
          id: string
          manage_token_expires_at: string | null
          manage_token_hash: string | null
          previous_booking_id: string | null
          salon_id: string
          source: Database["public"]["Enums"]["booking_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          time_range: unknown
          total_price_grosz: number
          updated_at: string
        }
        Insert: {
          buffer_after_minutes?: number
          cancellation_comment?: string | null
          client_id: string
          client_note?: string | null
          created_at?: string
          created_by?: string | null
          deposit_grosz?: number | null
          ends_at: string
          google_event_id?: string | null
          google_synced_at?: string | null
          id?: string
          manage_token_expires_at?: string | null
          manage_token_hash?: string | null
          previous_booking_id?: string | null
          salon_id: string
          source?: Database["public"]["Enums"]["booking_source"]
          staff_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          time_range?: unknown
          total_price_grosz?: number
          updated_at?: string
        }
        Update: {
          buffer_after_minutes?: number
          cancellation_comment?: string | null
          client_id?: string
          client_note?: string | null
          created_at?: string
          created_by?: string | null
          deposit_grosz?: number | null
          ends_at?: string
          google_event_id?: string | null
          google_synced_at?: string | null
          id?: string
          manage_token_expires_at?: string | null
          manage_token_hash?: string | null
          previous_booking_id?: string | null
          salon_id?: string
          source?: Database["public"]["Enums"]["booking_source"]
          staff_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          time_range?: unknown
          total_price_grosz?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_previous_booking_id_fkey"
            columns: ["previous_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          failure_count: number
          google_account_email: string
          google_calendar_id: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          refresh_token_encrypted: string | null
          salon_id: string
          staff_id: string
          status: Database["public"]["Enums"]["calendar_connection_status"]
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          failure_count?: number
          google_account_email: string
          google_calendar_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          salon_id: string
          staff_id: string
          status?: Database["public"]["Enums"]["calendar_connection_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          failure_count?: number
          google_account_email?: string
          google_calendar_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_encrypted?: string | null
          salon_id?: string
          staff_id?: string
          status?: Database["public"]["Enums"]["calendar_connection_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_connections_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          blocked: boolean
          created_at: string
          email: string
          first_name: string
          id: string
          internal_note: string | null
          internal_rating: number | null
          last_name: string | null
          no_show_count: number
          phone: string
          salon_id: string
          sms_consent: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          email: string
          first_name: string
          id?: string
          internal_note?: string | null
          internal_rating?: number | null
          last_name?: string | null
          no_show_count?: number
          phone: string
          salon_id: string
          sms_consent?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          blocked?: boolean
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          internal_note?: string | null
          internal_rating?: number | null
          last_name?: string | null
          no_show_count?: number
          phone?: string
          salon_id?: string
          sms_consent?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          attempts: number
          booking_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          provider_message_id: string | null
          recipient: string
          salon_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          template: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          provider_message_id?: string | null
          recipient: string
          salon_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          template: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          provider_message_id?: string | null
          recipient?: string
          salon_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_started_at: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_started_at?: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_started_at?: string
        }
        Relationships: []
      }
      salon_hours: {
        Row: {
          close_time: string
          created_at: string
          id: string
          open_time: string
          salon_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          close_time: string
          created_at?: string
          id?: string
          open_time: string
          salon_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          close_time?: string
          created_at?: string
          id?: string
          open_time?: string
          salon_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "salon_hours_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["salon_role"]
          salon_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["salon_role"]
          salon_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["salon_role"]
          salon_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_members_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salons: {
        Row: {
          active: boolean
          address_line: string | null
          auto_accept: boolean
          booking_horizon_days: number
          brand_color: string | null
          calendar_event_title_template: string
          cancellation_policy_text: string | null
          city: string | null
          client_cancel_lead_hours: number
          cover_url: string | null
          created_at: string
          email: string | null
          hold_minutes: number
          id: string
          logo_url: string | null
          min_lead_minutes: number
          name: string
          online_booking_enabled: boolean
          phone: string | null
          postal_code: string | null
          slot_step_minutes: number
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address_line?: string | null
          auto_accept?: boolean
          booking_horizon_days?: number
          brand_color?: string | null
          calendar_event_title_template?: string
          cancellation_policy_text?: string | null
          city?: string | null
          client_cancel_lead_hours?: number
          cover_url?: string | null
          created_at?: string
          email?: string | null
          hold_minutes?: number
          id?: string
          logo_url?: string | null
          min_lead_minutes?: number
          name: string
          online_booking_enabled?: boolean
          phone?: string | null
          postal_code?: string | null
          slot_step_minutes?: number
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address_line?: string | null
          auto_accept?: boolean
          booking_horizon_days?: number
          brand_color?: string | null
          calendar_event_title_template?: string
          cancellation_policy_text?: string | null
          city?: string | null
          client_cancel_lead_hours?: number
          cover_url?: string | null
          created_at?: string
          email?: string | null
          hold_minutes?: number
          id?: string
          logo_url?: string | null
          min_lead_minutes?: number
          name?: string
          online_booking_enabled?: boolean
          phone?: string | null
          postal_code?: string | null
          slot_step_minutes?: number
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_exceptions: {
        Row: {
          created_at: string
          end_time: string | null
          ends_on: string
          exception_type: Database["public"]["Enums"]["schedule_exception_type"]
          id: string
          reason: string | null
          salon_id: string
          staff_id: string | null
          start_time: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          ends_on: string
          exception_type: Database["public"]["Enums"]["schedule_exception_type"]
          id?: string
          reason?: string | null
          salon_id: string
          staff_id?: string | null
          start_time?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          ends_on?: string
          exception_type?: Database["public"]["Enums"]["schedule_exception_type"]
          id?: string
          reason?: string | null
          salon_id?: string
          staff_id?: string | null
          start_time?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      service_addons: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          max_quantity: number
          name: string
          price_grosz: number
          salon_id: string
          service_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          max_quantity?: number
          name: string
          price_grosz: number
          salon_id: string
          service_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          max_quantity?: number
          name?: string
          price_grosz?: number
          salon_id?: string
          service_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_addons_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_addons_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          salon_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          salon_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          salon_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      service_price_history: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          price_grosz: number
          salon_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          price_grosz: number
          salon_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          price_grosz?: number
          salon_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_price_history_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_price_history_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_after_minutes: number
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          photo_url: string | null
          price_grosz: number
          price_type: Database["public"]["Enums"]["price_type"]
          promo_ends_at: string | null
          promo_price_grosz: number | null
          promo_starts_at: string | null
          salon_id: string
          sort_order: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          buffer_after_minutes?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          name: string
          photo_url?: string | null
          price_grosz: number
          price_type?: Database["public"]["Enums"]["price_type"]
          promo_ends_at?: string | null
          promo_price_grosz?: number | null
          promo_starts_at?: string | null
          salon_id: string
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          buffer_after_minutes?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          photo_url?: string | null
          price_grosz?: number
          price_type?: Database["public"]["Enums"]["price_type"]
          promo_ends_at?: string | null
          promo_price_grosz?: number | null
          promo_starts_at?: string | null
          salon_id?: string
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          bio: string | null
          created_at: string
          display_name: string
          id: string
          photo_url: string | null
          salon_id: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          photo_url?: string | null
          salon_id: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          photo_url?: string | null
          salon_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["salon_role"]
          salon_id: string
          staff_id: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          role?: Database["public"]["Enums"]["salon_role"]
          salon_id: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["salon_role"]
          salon_id?: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          duration_minutes_override: number | null
          id: string
          price_grosz_override: number | null
          salon_id: string
          service_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes_override?: number | null
          id?: string
          price_grosz_override?: number | null
          salon_id: string
          service_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes_override?: number | null
          id?: string
          price_grosz_override?: number | null
          salon_id?: string
          service_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          reason: string | null
          salon_id: string
          staff_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          reason?: string | null
          salon_id: string
          staff_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          reason?: string | null
          salon_id?: string
          staff_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          created_at: string
          end_time: string
          id: string
          salon_id: string
          staff_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          salon_id: string
          staff_id: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          salon_id?: string
          staff_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_overview: {
        Row: {
          blocked: boolean | null
          completed_count: number | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          last_visit_at: string | null
          next_visit_at: string | null
          no_show_count: number | null
          phone: string | null
          salon_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_salon_overview: {
        Args: never
        Returns: {
          active: boolean
          bookings_last_30_days: number
          city: string
          created_at: string
          name: string
          online_booking_enabled: boolean
          owner_count: number
          salon_id: string
          slug: string
          staff_count: number
          upcoming_bookings: number
        }[]
      }
      admin_set_salon_active: {
        Args: { p_active: boolean; p_salon_id: string }
        Returns: undefined
      }
      available_slots_unchecked: {
        Args: {
          p_extra_minutes?: number
          p_from: string
          p_salon_id: string
          p_service_ids: string[]
          p_staff_id?: string
          p_to: string
        }
        Returns: {
          slot_end: string
          slot_start: string
          staff_id: string
        }[]
      }
      booking_item_lines: {
        Args: {
          p_salon_id: string
          p_service_ids: string[]
          p_staff_id: string
        }
        Returns: {
          buffer_after_minutes: number
          duration_minutes: number
          item_order: number
          name_snapshot: string
          price_grosz: number
          service_id: string
        }[]
      }
      caller_may_read_salon: { Args: { p_salon_id: string }; Returns: boolean }
      change_booking_status: {
        Args: {
          p_booking_id: string
          p_comment?: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: undefined
      }
      complete_past_bookings: { Args: never; Returns: number }
      create_booking: {
        Args: {
          p_addons?: Json
          p_client_id: string
          p_client_note?: string
          p_salon_id: string
          p_service_ids: string[]
          p_source?: Database["public"]["Enums"]["booking_source"]
          p_staff_id: string
          p_starts_at: string
          p_status?: Database["public"]["Enums"]["booking_status"]
        }
        Returns: string
      }
      current_staff_id: { Args: { p_salon_id: string }; Returns: string }
      deactivate_finished_promotions: { Args: never; Returns: number }
      expire_pending_bookings: { Args: never; Returns: number }
      get_available_slots: {
        Args: {
          p_extra_minutes?: number
          p_from: string
          p_salon_id: string
          p_service_ids: string[]
          p_staff_id?: string
          p_to: string
        }
        Returns: {
          slot_end: string
          slot_start: string
          staff_id: string
        }[]
      }
      is_app_admin: { Args: never; Returns: boolean }
      is_salon_member: { Args: { p_salon_id: string }; Returns: boolean }
      is_salon_owner: { Args: { p_salon_id: string }; Returns: boolean }
      lowest_price_before_promo: {
        Args: { p_service_id: string }
        Returns: number
      }
      purge_rate_limits: { Args: never; Returns: number }
      rate_limit_take: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      reply_to_review: {
        Args: { p_reply: string; p_review_id: string }
        Returns: undefined
      }
      reschedule_booking: {
        Args: {
          p_booking_id: string
          p_new_staff_id?: string
          p_new_starts_at: string
        }
        Returns: string
      }
      salon_rating: {
        Args: { p_salon_id: string }
        Returns: {
          average: number
          reviews_count: number
        }[]
      }
      service_pricing: {
        Args: { p_salon_id: string; p_staff_id?: string }
        Returns: {
          duration_minutes: number
          lowest_price_before_promo_grosz: number
          price_grosz: number
          promo_active: boolean
          promo_ends_at: string
          regular_price_grosz: number
          service_id: string
        }[]
      }
      staff_ratings: {
        Args: { p_salon_id: string }
        Returns: {
          average: number
          reviews_count: number
          staff_id: string
        }[]
      }
    }
    Enums: {
      booking_source: "web" | "manual" | "app"
      booking_status:
        | "pending_confirmation"
        | "pending_approval"
        | "confirmed"
        | "completed"
        | "cancelled_by_client"
        | "cancelled_by_salon"
        | "rescheduled"
        | "expired"
        | "no_show"
      calendar_connection_status: "connected" | "needs_reauth" | "disconnected"
      email_status: "pending" | "sent" | "failed"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      price_type: "fixed" | "from" | "variable"
      salon_role: "owner" | "staff"
      schedule_exception_type: "day_off" | "custom_hours"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {
      booking_source: ["web", "manual", "app"],
      booking_status: [
        "pending_confirmation",
        "pending_approval",
        "confirmed",
        "completed",
        "cancelled_by_client",
        "cancelled_by_salon",
        "rescheduled",
        "expired",
        "no_show",
      ],
      calendar_connection_status: ["connected", "needs_reauth", "disconnected"],
      email_status: ["pending", "sent", "failed"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      price_type: ["fixed", "from", "variable"],
      salon_role: ["owner", "staff"],
      schedule_exception_type: ["day_off", "custom_hours"],
    },
  },
} as const

