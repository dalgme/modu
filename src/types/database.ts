export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string;
          key: string;
          program_id: string | null;
          updated_at: string;
          updated_by: string | null;
          value: string;
        };
        Insert: {
          id?: string;
          key: string;
          program_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Update: {
          id?: string;
          key?: string;
          program_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'app_settings_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'app_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          ip_address: string | null;
          metadata: Json | null;
          program_id: string | null;
          updated_at: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          program_id?: string | null;
          updated_at?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
          metadata?: Json | null;
          program_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      board_posts: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          title: string;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          title: string;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          title?: string;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'board_posts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      board_replies: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          post_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          post_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'board_replies_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'board_replies_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'board_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      case_status_history: {
        Row: {
          case_id: string;
          changed_by: string | null;
          created_at: string;
          from_status: Database['public']['Enums']['case_status'] | null;
          id: string;
          note: string | null;
          to_status: Database['public']['Enums']['case_status'];
          updated_at: string;
        };
        Insert: {
          case_id: string;
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['case_status'] | null;
          id?: string;
          note?: string | null;
          to_status: Database['public']['Enums']['case_status'];
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['case_status'] | null;
          id?: string;
          note?: string | null;
          to_status?: Database['public']['Enums']['case_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'case_status_history_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'case_status_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      cases: {
        Row: {
          address: string | null;
          business_name: string;
          business_reg_no: string | null;
          business_type: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string;
          email: string | null;
          employee_count: number | null;
          id: string;
          intake_note: string | null;
          item: string | null;
          mentee_id: string | null;
          opened_at: string | null;
          owner_name: string;
          phone: string;
          predecessor_case_id: string | null;
          program_id: string;
          status: Database['public']['Enums']['case_status'];
          support_type_id: string;
          updated_at: string;
          withdrawn_at: string | null;
          withdrawn_reason: string | null;
        };
        Insert: {
          address?: string | null;
          business_name: string;
          business_reg_no?: string | null;
          business_type?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by: string;
          email?: string | null;
          employee_count?: number | null;
          id?: string;
          intake_note?: string | null;
          item?: string | null;
          mentee_id?: string | null;
          opened_at?: string | null;
          owner_name: string;
          phone: string;
          predecessor_case_id?: string | null;
          program_id: string;
          status?: Database['public']['Enums']['case_status'];
          support_type_id: string;
          updated_at?: string;
          withdrawn_at?: string | null;
          withdrawn_reason?: string | null;
        };
        Update: {
          address?: string | null;
          business_name?: string;
          business_reg_no?: string | null;
          business_type?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          employee_count?: number | null;
          id?: string;
          intake_note?: string | null;
          item?: string | null;
          mentee_id?: string | null;
          opened_at?: string | null;
          owner_name?: string;
          phone?: string;
          predecessor_case_id?: string | null;
          program_id?: string;
          status?: Database['public']['Enums']['case_status'];
          support_type_id?: string;
          updated_at?: string;
          withdrawn_at?: string | null;
          withdrawn_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cases_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cases_mentee_id_fkey';
            columns: ['mentee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cases_predecessor_case_id_fkey';
            columns: ['predecessor_case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cases_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cases_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
        ];
      };
      consulting_rates: {
        Row: {
          created_at: string;
          created_by: string | null;
          daily_cap_amount: number;
          effective_from: string;
          id: string;
          mode: Database['public']['Enums']['consulting_mode'];
          program_id: string;
          support_type_id: string | null;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          daily_cap_amount: number;
          effective_from: string;
          id?: string;
          mode: Database['public']['Enums']['consulting_mode'];
          program_id: string;
          support_type_id?: string | null;
          unit_price: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          daily_cap_amount?: number;
          effective_from?: string;
          id?: string;
          mode?: Database['public']['Enums']['consulting_mode'];
          program_id?: string;
          support_type_id?: string | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'consulting_rates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consulting_rates_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consulting_rates_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
        ];
      };
      document_templates: {
        Row: {
          attachment_no: string | null;
          created_at: string;
          field_mapping: Json;
          html_content: string;
          id: string;
          is_active: boolean;
          name: string;
          program_id: string | null;
          support_type_id: string | null;
          template_key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          attachment_no?: string | null;
          created_at?: string;
          field_mapping?: Json;
          html_content: string;
          id?: string;
          is_active?: boolean;
          name: string;
          program_id?: string | null;
          support_type_id?: string | null;
          template_key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          attachment_no?: string | null;
          created_at?: string;
          field_mapping?: Json;
          html_content?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          program_id?: string | null;
          support_type_id?: string | null;
          template_key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_templates_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_templates_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_templates_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          case_id: string;
          created_at: string;
          doc_key: string;
          doc_name: string;
          file_size: number | null;
          id: string;
          mentor_visible: boolean;
          mime_type: string | null;
          sha256: string;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
          uploaded_role: Database['public']['Enums']['user_role'] | null;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          doc_key: string;
          doc_name: string;
          file_size?: number | null;
          id?: string;
          mentor_visible?: boolean;
          mime_type?: string | null;
          sha256: string;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
          uploaded_role?: Database['public']['Enums']['user_role'] | null;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          doc_key?: string;
          doc_name?: string;
          file_size?: number | null;
          id?: string;
          mentor_visible?: boolean;
          mime_type?: string | null;
          sha256?: string;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
          uploaded_role?: Database['public']['Enums']['user_role'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      faqs: {
        Row: {
          answer: string;
          audience: string;
          created_at: string;
          id: string;
          is_published: boolean;
          question: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          answer: string;
          audience?: string;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          question: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          answer?: string;
          audience?: string;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          question?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiries: {
        Row: {
          answer: string | null;
          answered_at: string | null;
          answered_by: string | null;
          body: string;
          case_id: string | null;
          category: string;
          created_at: string;
          id: string;
          mentee_id: string;
          status: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          answer?: string | null;
          answered_at?: string | null;
          answered_by?: string | null;
          body: string;
          case_id?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          mentee_id: string;
          status?: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          answer?: string | null;
          answered_at?: string | null;
          answered_by?: string | null;
          body?: string;
          case_id?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          mentee_id?: string;
          status?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inquiries_answered_by_fkey';
            columns: ['answered_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inquiries_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inquiries_mentee_id_fkey';
            columns: ['mentee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      match_recommendations: {
        Row: {
          adopted_at: string | null;
          case_id: string;
          generated_at: string;
          generated_by: string | null;
          id: string;
          mentor_id: string;
          model: string | null;
          objective: Json;
          program_id: string;
          prompt_version: string | null;
          rank: number;
          rationale: string | null;
          score: number;
        };
        Insert: {
          adopted_at?: string | null;
          case_id: string;
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          mentor_id: string;
          model?: string | null;
          objective: Json;
          program_id: string;
          prompt_version?: string | null;
          rank: number;
          rationale?: string | null;
          score: number;
        };
        Update: {
          adopted_at?: string | null;
          case_id?: string;
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          mentor_id?: string;
          model?: string | null;
          objective?: Json;
          program_id?: string;
          prompt_version?: string | null;
          rank?: number;
          rationale?: string | null;
          score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'match_recommendations_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_recommendations_generated_by_fkey';
            columns: ['generated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_recommendations_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_recommendations_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      mentee_profiles: {
        Row: {
          case_id: string;
          created_at: string;
          industry: string | null;
          keywords: string[];
          needs: string[];
          preferred_mode: Database['public']['Enums']['consulting_mode'] | null;
          program_id: string;
          region: string | null;
          stage: string | null;
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          industry?: string | null;
          keywords?: string[];
          needs?: string[];
          preferred_mode?: Database['public']['Enums']['consulting_mode'] | null;
          program_id: string;
          region?: string | null;
          stage?: string | null;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          industry?: string | null;
          keywords?: string[];
          needs?: string[];
          preferred_mode?: Database['public']['Enums']['consulting_mode'] | null;
          program_id?: string;
          region?: string | null;
          stage?: string | null;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentee_profiles_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: true;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentee_profiles_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          case_id: string;
          created_at: string;
          end_kind: string | null;
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          id: string;
          is_active: boolean;
          mentor_id: string;
          reason_visibility: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          case_id: string;
          created_at?: string;
          end_kind?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: string;
          is_active?: boolean;
          mentor_id: string;
          reason_visibility?: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          case_id?: string;
          created_at?: string;
          end_kind?: string | null;
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: string;
          is_active?: boolean;
          mentor_id?: string;
          reason_visibility?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_assignments_assigned_by_fkey';
            columns: ['assigned_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_assignments_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_assignments_ended_by_fkey';
            columns: ['ended_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_assignments_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_change_requests: {
        Row: {
          case_id: string;
          created_at: string;
          handled_at: string | null;
          handled_by: string | null;
          handling_note: string | null;
          id: string;
          reason: string;
          requested_by: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          handling_note?: string | null;
          id?: string;
          reason: string;
          requested_by: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          handling_note?: string | null;
          id?: string;
          reason?: string;
          requested_by?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_change_requests_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_change_requests_handled_by_fkey';
            columns: ['handled_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_change_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_group_reviews: {
        Row: {
          author_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          memo: string | null;
          mentor_id: string;
          program_id: string;
          rating: number | null;
          support_type_id: string;
          tags: string[];
        };
        Insert: {
          author_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          memo?: string | null;
          mentor_id: string;
          program_id: string;
          rating?: number | null;
          support_type_id: string;
          tags?: string[];
        };
        Update: {
          author_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          memo?: string | null;
          mentor_id?: string;
          program_id?: string;
          rating?: number | null;
          support_type_id?: string;
          tags?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_group_reviews_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_group_reviews_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_group_reviews_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_group_reviews_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_payment_docs: {
        Row: {
          bankbook_received_at: string | null;
          checked_by: string | null;
          created_at: string;
          id: string;
          id_card_received_at: string | null;
          note: string | null;
          program_id: string;
          resume_received_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bankbook_received_at?: string | null;
          checked_by?: string | null;
          created_at?: string;
          id?: string;
          id_card_received_at?: string | null;
          note?: string | null;
          program_id: string;
          resume_received_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bankbook_received_at?: string | null;
          checked_by?: string | null;
          created_at?: string;
          id?: string;
          id_card_received_at?: string | null;
          note?: string | null;
          program_id?: string;
          resume_received_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_payment_docs_checked_by_fkey';
            columns: ['checked_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_payment_docs_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_payment_docs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_profiles: {
        Row: {
          bio: string | null;
          capacity: number;
          career: string | null;
          created_at: string;
          expertise: string[];
          id: string;
          industries: string[];
          keywords: string[];
          modes: Database['public']['Enums']['consulting_mode'][];
          program_id: string;
          regions: string[];
          stages: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bio?: string | null;
          capacity?: number;
          career?: string | null;
          created_at?: string;
          expertise?: string[];
          id?: string;
          industries?: string[];
          keywords?: string[];
          modes?: Database['public']['Enums']['consulting_mode'][];
          program_id: string;
          regions?: string[];
          stages?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bio?: string | null;
          capacity?: number;
          career?: string | null;
          created_at?: string;
          expertise?: string[];
          id?: string;
          industries?: string[];
          keywords?: string[];
          modes?: Database['public']['Enums']['consulting_mode'][];
          program_id?: string;
          regions?: string[];
          stages?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_profiles_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_signatures: {
        Row: {
          created_at: string;
          sha256: string;
          storage_path: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          sha256: string;
          storage_path: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          sha256?: string;
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_signatures_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mentor_withdrawal_requests: {
        Row: {
          assignment_id: string;
          case_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          mentor_id: string;
          reason: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          assignment_id: string;
          case_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          mentor_id: string;
          reason: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string;
          case_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          mentor_id?: string;
          reason?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentor_withdrawal_requests_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'mentor_assignments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_withdrawal_requests_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_withdrawal_requests_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentor_withdrawal_requests_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mentoring_logs: {
        Row: {
          amount_snapshot: number;
          case_id: string;
          content: string | null;
          created_at: string;
          difficulties: string | null;
          ended_at: string;
          id: string;
          is_extra: boolean;
          mentee_signed_at: string | null;
          mentor_id: string;
          mode: Database['public']['Enums']['consulting_mode'];
          place: string | null;
          rate_id: string | null;
          report_kind: string;
          result: string | null;
          round_no: number;
          settlement_id: string | null;
          started_at: string;
          topic: string | null;
          unit_price_snapshot: number;
          updated_at: string;
        };
        Insert: {
          amount_snapshot: number;
          case_id: string;
          content?: string | null;
          created_at?: string;
          difficulties?: string | null;
          ended_at: string;
          id?: string;
          is_extra?: boolean;
          mentee_signed_at?: string | null;
          mentor_id: string;
          mode: Database['public']['Enums']['consulting_mode'];
          place?: string | null;
          rate_id?: string | null;
          report_kind?: string;
          result?: string | null;
          round_no: number;
          settlement_id?: string | null;
          started_at: string;
          topic?: string | null;
          unit_price_snapshot: number;
          updated_at?: string;
        };
        Update: {
          amount_snapshot?: number;
          case_id?: string;
          content?: string | null;
          created_at?: string;
          difficulties?: string | null;
          ended_at?: string;
          id?: string;
          is_extra?: boolean;
          mentee_signed_at?: string | null;
          mentor_id?: string;
          mode?: Database['public']['Enums']['consulting_mode'];
          place?: string | null;
          rate_id?: string | null;
          report_kind?: string;
          result?: string | null;
          round_no?: number;
          settlement_id?: string | null;
          started_at?: string;
          topic?: string | null;
          unit_price_snapshot?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mentoring_logs_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentoring_logs_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentoring_logs_rate_id_fkey';
            columns: ['rate_id'];
            isOneToOne: false;
            referencedRelation: 'consulting_rates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mentoring_logs_settlement_id_fkey';
            columns: ['settlement_id'];
            isOneToOne: false;
            referencedRelation: 'settlements';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          case_id: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          created_at: string;
          error_message: string | null;
          id: string;
          payload: Json | null;
          program_id: string | null;
          recipient_id: string | null;
          recipient_phone: string | null;
          sent_at: string | null;
          status: Database['public']['Enums']['notification_status'];
          template_code: string | null;
          trigger_event: string;
          updated_at: string;
        };
        Insert: {
          case_id?: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          created_at?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json | null;
          program_id?: string | null;
          recipient_id?: string | null;
          recipient_phone?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template_code?: string | null;
          trigger_event: string;
          updated_at?: string;
        };
        Update: {
          case_id?: string | null;
          channel?: Database['public']['Enums']['notification_channel'];
          created_at?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json | null;
          program_id?: string | null;
          recipient_id?: string | null;
          recipient_phone?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template_code?: string | null;
          trigger_event?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      observation_reports: {
        Row: {
          case_id: string;
          content: Json;
          created_at: string;
          mentor_id: string;
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          content?: Json;
          created_at?: string;
          mentor_id: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          content?: Json;
          created_at?: string;
          mentor_id?: string;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'observation_reports_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: true;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'observation_reports_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      operating_limits: {
        Row: {
          case_daily_round_limit: number;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          mentor_daily_case_limit: number;
          program_id: string;
          support_type_id: string | null;
        };
        Insert: {
          case_daily_round_limit?: number;
          created_at?: string;
          created_by?: string | null;
          effective_from: string;
          id?: string;
          mentor_daily_case_limit?: number;
          program_id: string;
          support_type_id?: string | null;
        };
        Update: {
          case_daily_round_limit?: number;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          mentor_daily_case_limit?: number;
          program_id?: string;
          support_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'operating_limits_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operating_limits_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operating_limits_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
        ];
      };
      operator_requests: {
        Row: {
          body: string;
          case_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          read_at: string | null;
          read_by: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          case_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          read_at?: string | null;
          read_by?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          case_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          read_at?: string | null;
          read_by?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operator_requests_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operator_requests_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operator_requests_read_by_fkey';
            columns: ['read_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      password_reset_otps: {
        Row: {
          attempts: number;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'password_reset_otps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      program_members: {
        Row: {
          created_at: string;
          duty: string | null;
          grade: string | null;
          id: string;
          is_active: boolean;
          joined_at: string;
          left_at: string | null;
          note: string | null;
          program_id: string;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duty?: string | null;
          grade?: string | null;
          id?: string;
          is_active?: boolean;
          joined_at?: string;
          left_at?: string | null;
          note?: string | null;
          program_id: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duty?: string | null;
          grade?: string | null;
          id?: string;
          is_active?: boolean;
          joined_at?: string;
          left_at?: string | null;
          note?: string | null;
          program_id?: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'program_members_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      program_sms_access_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          detail: Json | null;
          id: string;
          program_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          id?: string;
          program_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          id?: string;
          program_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'program_sms_access_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_sms_access_log_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      program_sms_settings: {
        Row: {
          api_key_enc: string;
          api_key_hint: string;
          api_secret_enc: string;
          created_at: string;
          created_by: string | null;
          dek_wrapped: string;
          enc_version: number;
          fingerprint: string;
          is_active: boolean;
          program_id: string;
          provider: string;
          rotated_at: string;
          sender_number_enc: string;
          sender_number_hint: string;
          updated_at: string;
          updated_by: string | null;
          verified_at: string | null;
        };
        Insert: {
          api_key_enc: string;
          api_key_hint: string;
          api_secret_enc: string;
          created_at?: string;
          created_by?: string | null;
          dek_wrapped: string;
          enc_version?: number;
          fingerprint: string;
          is_active?: boolean;
          program_id: string;
          provider?: string;
          rotated_at?: string;
          sender_number_enc: string;
          sender_number_hint: string;
          updated_at?: string;
          updated_by?: string | null;
          verified_at?: string | null;
        };
        Update: {
          api_key_enc?: string;
          api_key_hint?: string;
          api_secret_enc?: string;
          created_at?: string;
          created_by?: string | null;
          dek_wrapped?: string;
          enc_version?: number;
          fingerprint?: string;
          is_active?: boolean;
          program_id?: string;
          provider?: string;
          rotated_at?: string;
          sender_number_enc?: string;
          sender_number_hint?: string;
          updated_at?: string;
          updated_by?: string | null;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'program_sms_settings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_sms_settings_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: true;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_sms_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      programs: {
        Row: {
          app_title: string | null;
          client_logo_path: string | null;
          client_name: string;
          client_seal_name: string | null;
          client_short: string | null;
          closure_policy: Json;
          created_at: string;
          created_by: string | null;
          default_required_rounds: number;
          default_withholding_method: string;
          email_subject_prefix: string | null;
          ends_on: string | null;
          id: string;
          logo_path: string | null;
          name: string;
          operator_contact: string | null;
          operator_name: string;
          operator_short: string | null;
          round_report_policy: Json;
          slug: string;
          sms_footer: string | null;
          staff_permissions: Json;
          starts_on: string | null;
          status: string;
          updated_at: string;
          withholding_params: Json;
        };
        Insert: {
          app_title?: string | null;
          client_logo_path?: string | null;
          client_name: string;
          client_seal_name?: string | null;
          client_short?: string | null;
          closure_policy?: Json;
          created_at?: string;
          created_by?: string | null;
          default_required_rounds?: number;
          default_withholding_method?: string;
          email_subject_prefix?: string | null;
          ends_on?: string | null;
          id?: string;
          logo_path?: string | null;
          name: string;
          operator_contact?: string | null;
          operator_name: string;
          operator_short?: string | null;
          round_report_policy?: Json;
          slug: string;
          sms_footer?: string | null;
          staff_permissions?: Json;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
          withholding_params?: Json;
        };
        Update: {
          app_title?: string | null;
          client_logo_path?: string | null;
          client_name?: string;
          client_seal_name?: string | null;
          client_short?: string | null;
          closure_policy?: Json;
          created_at?: string;
          created_by?: string | null;
          default_required_rounds?: number;
          default_withholding_method?: string;
          email_subject_prefix?: string | null;
          ends_on?: string | null;
          id?: string;
          logo_path?: string | null;
          name?: string;
          operator_contact?: string | null;
          operator_name?: string;
          operator_short?: string | null;
          round_report_policy?: Json;
          slug?: string;
          sms_footer?: string | null;
          staff_permissions?: Json;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
          withholding_params?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'programs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      report_snapshots: {
        Row: {
          created_at: string;
          generated_at: string;
          generated_by: string | null;
          id: string;
          metrics: Json;
          narrative: Json;
          program_id: string;
          support_type_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          metrics: Json;
          narrative?: Json;
          program_id: string;
          support_type_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          metrics?: Json;
          narrative?: Json;
          program_id?: string;
          support_type_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_snapshots_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          case_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          kind: string;
          result: Database['public']['Enums']['review_result'];
          reviewer_id: string | null;
          settlement_id: string | null;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          result: Database['public']['Enums']['review_result'];
          reviewer_id?: string | null;
          settlement_id?: string | null;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          result?: Database['public']['Enums']['review_result'];
          reviewer_id?: string | null;
          settlement_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_settlement_id_fkey';
            columns: ['settlement_id'];
            isOneToOne: false;
            referencedRelation: 'settlements';
            referencedColumns: ['id'];
          },
        ];
      };
      round_extension_requests: {
        Row: {
          case_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          extra_rounds: number;
          id: string;
          reason: string;
          requested_by: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          extra_rounds?: number;
          id?: string;
          reason: string;
          requested_by: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          extra_rounds?: number;
          id?: string;
          reason?: string;
          requested_by?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'round_extension_requests_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'round_extension_requests_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'round_extension_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      scheduled_messages: {
        Row: {
          created_at: string;
          created_by: string | null;
          dispatched_at: string | null;
          failed_count: number;
          id: string;
          recipient_count: number;
          recipient_ids: string[];
          scheduled_at: string;
          sender_index: number;
          sent_count: number;
          status: string;
          text: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          dispatched_at?: string | null;
          failed_count?: number;
          id?: string;
          recipient_count?: number;
          recipient_ids?: string[];
          scheduled_at: string;
          sender_index?: number;
          sent_count?: number;
          status?: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          dispatched_at?: string | null;
          failed_count?: number;
          id?: string;
          recipient_count?: number;
          recipient_ids?: string[];
          scheduled_at?: string;
          sender_index?: number;
          sent_count?: number;
          status?: string;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scheduled_messages_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      settlement_batches: {
        Row: {
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          paid_at: string | null;
          program_id: string;
          status: string;
          submitted_at: string | null;
          title: string;
          total_gross: number;
          total_net: number;
          total_withholding: number;
          updated_at: string;
        };
        Insert: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          paid_at?: string | null;
          program_id: string;
          status?: string;
          submitted_at?: string | null;
          title: string;
          total_gross?: number;
          total_net?: number;
          total_withholding?: number;
          updated_at?: string;
        };
        Update: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          paid_at?: string | null;
          program_id?: string;
          status?: string;
          submitted_at?: string | null;
          title?: string;
          total_gross?: number;
          total_net?: number;
          total_withholding?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'settlement_batches_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlement_batches_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlement_batches_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      settlements: {
        Row: {
          batch_id: string | null;
          cancel_reason: string | null;
          canceled_at: string | null;
          canceled_by: string | null;
          case_id: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          gross: number;
          id: string;
          income_tax: number;
          kind: string;
          lines: Json;
          local_tax: number;
          mentor_id: string;
          net: number;
          paid_at: string | null;
          program_id: string;
          rounds_snapshot: Json;
          status: string;
          taxable: number;
          updated_at: string;
          withholding: number;
          withholding_method: string;
          withholding_policy: Json;
        };
        Insert: {
          batch_id?: string | null;
          cancel_reason?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          case_id: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          gross: number;
          id?: string;
          income_tax?: number;
          kind: string;
          lines: Json;
          local_tax?: number;
          mentor_id: string;
          net: number;
          paid_at?: string | null;
          program_id: string;
          rounds_snapshot: Json;
          status?: string;
          taxable?: number;
          updated_at?: string;
          withholding?: number;
          withholding_method: string;
          withholding_policy: Json;
        };
        Update: {
          batch_id?: string | null;
          cancel_reason?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          case_id?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          gross?: number;
          id?: string;
          income_tax?: number;
          kind?: string;
          lines?: Json;
          local_tax?: number;
          mentor_id?: string;
          net?: number;
          paid_at?: string | null;
          program_id?: string;
          rounds_snapshot?: Json;
          status?: string;
          taxable?: number;
          updated_at?: string;
          withholding?: number;
          withholding_method?: string;
          withholding_policy?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'settlements_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'settlement_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_canceled_by_fkey';
            columns: ['canceled_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_mentor_id_fkey';
            columns: ['mentor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlements_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      signatures: {
        Row: {
          case_id: string;
          created_at: string;
          document_type: string;
          id: string;
          log_id: string | null;
          sha256: string;
          signer_name: string | null;
          signer_type: Database['public']['Enums']['signer_type'];
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          document_type: string;
          id?: string;
          log_id?: string | null;
          sha256: string;
          signer_name?: string | null;
          signer_type: Database['public']['Enums']['signer_type'];
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          document_type?: string;
          id?: string;
          log_id?: string | null;
          sha256?: string;
          signer_name?: string | null;
          signer_type?: Database['public']['Enums']['signer_type'];
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'signatures_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signatures_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'mentoring_logs';
            referencedColumns: ['id'];
          },
        ];
      };
      supplement_requests: {
        Row: {
          case_id: string;
          created_at: string;
          created_by: string | null;
          created_by_role: string | null;
          id: string;
          message: string;
          phase: string;
          resolved_at: string | null;
          resolved_by: string | null;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          created_by?: string | null;
          created_by_role?: string | null;
          id?: string;
          message: string;
          phase?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          created_by?: string | null;
          created_by_role?: string | null;
          id?: string;
          message?: string;
          phase?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supplement_requests_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplement_requests_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplement_requests_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      support_type_documents: {
        Row: {
          attachment_no: string | null;
          condition: string | null;
          created_at: string;
          doc_key: string;
          doc_name: string;
          for_role: string;
          id: string;
          is_required: boolean;
          multiple: boolean;
          sort_order: number;
          support_type_id: string;
          updated_at: string;
        };
        Insert: {
          attachment_no?: string | null;
          condition?: string | null;
          created_at?: string;
          doc_key: string;
          doc_name: string;
          for_role?: string;
          id?: string;
          is_required?: boolean;
          multiple?: boolean;
          sort_order?: number;
          support_type_id: string;
          updated_at?: string;
        };
        Update: {
          attachment_no?: string | null;
          condition?: string | null;
          created_at?: string;
          doc_key?: string;
          doc_name?: string;
          for_role?: string;
          id?: string;
          is_required?: boolean;
          multiple?: boolean;
          sort_order?: number;
          support_type_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_type_documents_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
        ];
      };
      support_type_members: {
        Row: {
          created_at: string;
          duty: string | null;
          id: string;
          is_active: boolean;
          joined_at: string;
          left_at: string | null;
          member_role: string;
          note: string | null;
          support_type_id: string;
          updated_at: string;
          user_id: string;
          withholding_method: string | null;
        };
        Insert: {
          created_at?: string;
          duty?: string | null;
          id?: string;
          is_active?: boolean;
          joined_at?: string;
          left_at?: string | null;
          member_role: string;
          note?: string | null;
          support_type_id: string;
          updated_at?: string;
          user_id: string;
          withholding_method?: string | null;
        };
        Update: {
          created_at?: string;
          duty?: string | null;
          id?: string;
          is_active?: boolean;
          joined_at?: string;
          left_at?: string | null;
          member_role?: string;
          note?: string | null;
          support_type_id?: string;
          updated_at?: string;
          user_id?: string;
          withholding_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'support_type_members_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_type_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      support_types: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          ends_on: string | null;
          id: string;
          name: string;
          predecessor_support_type_id: string | null;
          program_id: string;
          required_rounds: number;
          round_label: string;
          round_report_policy: Json | null;
          sort_order: number;
          starts_on: string | null;
          status: string;
          updated_at: string;
          withholding_method: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          ends_on?: string | null;
          id?: string;
          name: string;
          predecessor_support_type_id?: string | null;
          program_id: string;
          required_rounds?: number;
          round_label?: string;
          round_report_policy?: Json | null;
          sort_order?: number;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
          withholding_method?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          ends_on?: string | null;
          id?: string;
          name?: string;
          predecessor_support_type_id?: string | null;
          program_id?: string;
          required_rounds?: number;
          round_label?: string;
          round_report_policy?: Json | null;
          sort_order?: number;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
          withholding_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'support_types_predecessor_support_type_id_fkey';
            columns: ['predecessor_support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_types_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      survey_questions: {
        Row: {
          created_at: string;
          help: string | null;
          id: string;
          label: string;
          options: Json | null;
          qtype: string;
          required: boolean;
          sort_order: number;
          template_id: string;
        };
        Insert: {
          created_at?: string;
          help?: string | null;
          id?: string;
          label: string;
          options?: Json | null;
          qtype: string;
          required?: boolean;
          sort_order?: number;
          template_id: string;
        };
        Update: {
          created_at?: string;
          help?: string | null;
          id?: string;
          label?: string;
          options?: Json | null;
          qtype?: string;
          required?: boolean;
          sort_order?: number;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_questions_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'survey_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      survey_responses: {
        Row: {
          answers: Json;
          case_id: string;
          id: string;
          mentee_id: string;
          score: number | null;
          submitted_at: string;
          template_id: string;
        };
        Insert: {
          answers: Json;
          case_id: string;
          id?: string;
          mentee_id: string;
          score?: number | null;
          submitted_at?: string;
          template_id: string;
        };
        Update: {
          answers?: Json;
          case_id?: string;
          id?: string;
          mentee_id?: string;
          score?: number | null;
          submitted_at?: string;
          template_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_responses_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: true;
            referencedRelation: 'cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_responses_mentee_id_fkey';
            columns: ['mentee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_responses_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'survey_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      survey_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          locked_at: string | null;
          name: string;
          program_id: string;
          support_type_id: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          locked_at?: string | null;
          name: string;
          program_id: string;
          support_type_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          locked_at?: string | null;
          name?: string;
          program_id?: string;
          support_type_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_templates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_templates_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_templates_support_type_id_fkey';
            columns: ['support_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_types';
            referencedColumns: ['id'];
          },
        ];
      };
      tag_catalog: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          label: string;
          program_id: string;
          sort_order: number;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          label: string;
          program_id: string;
          sort_order?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          label?: string;
          program_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tag_catalog_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          activated_at: string | null;
          created_at: string;
          email: string | null;
          id: string;
          invited_at: string | null;
          is_active: boolean;
          is_platform_admin: boolean;
          must_change_password: boolean;
          name: string;
          password_changed_at: string | null;
          phone: string | null;
          platform_role: string | null;
          position: string | null;
          privacy_agreed_at: string | null;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          email?: string | null;
          id: string;
          invited_at?: string | null;
          is_active?: boolean;
          is_platform_admin?: boolean;
          must_change_password?: boolean;
          name: string;
          password_changed_at?: string | null;
          phone?: string | null;
          platform_role?: string | null;
          position?: string | null;
          privacy_agreed_at?: string | null;
          role: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          invited_at?: string | null;
          is_active?: boolean;
          is_platform_admin?: boolean;
          must_change_password?: boolean;
          name?: string;
          password_changed_at?: string | null;
          phone?: string | null;
          platform_role?: string | null;
          position?: string | null;
          privacy_agreed_at?: string | null;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      case_status:
        | 'registered'
        | 'mentor_assigned'
        | 'in_progress'
        | 'reassignment_pending'
        | 'closure_requested'
        | 'revision_requested'
        | 'settlement_pending'
        | 'settlement_batched'
        | 'closed'
        | 'withdrawn';
      consulting_mode: 'online' | 'offline';
      notification_channel: 'alimtalk' | 'sms';
      notification_status: 'pending' | 'sent' | 'failed' | 'fallback_sent';
      review_result: 'approved' | 'revision_requested';
      signer_type: 'mentor' | 'mentee' | 'contractor';
      user_role: 'institution' | 'nextlab' | 'mentor' | 'mentee';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      case_status: [
        'registered',
        'mentor_assigned',
        'in_progress',
        'reassignment_pending',
        'closure_requested',
        'revision_requested',
        'settlement_pending',
        'settlement_batched',
        'closed',
        'withdrawn',
      ],
      consulting_mode: ['online', 'offline'],
      notification_channel: ['alimtalk', 'sms'],
      notification_status: ['pending', 'sent', 'failed', 'fallback_sent'],
      review_result: ['approved', 'revision_requested'],
      signer_type: ['mentor', 'mentee', 'contractor'],
      user_role: ['institution', 'nextlab', 'mentor', 'mentee'],
    },
  },
} as const;
