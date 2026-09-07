/**
 * Supabase 데이터베이스 타입.
 * 자동 생성됨 — 스키마 변경 시 재생성:
 *   supabase gen types typescript --project-id thgdodvxhxukvwqpzbyi > src/types/database.ts
 * (또는 Supabase MCP generate_typescript_types)
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      approvals: {
        Row: {
          approval_type: Database['public']['Enums']['approval_type'];
          approver_id: string | null;
          case_id: string;
          created_at: string;
          id: string;
          reason: string | null;
          result: Database['public']['Enums']['approval_result'];
          updated_at: string;
        };
        Insert: {
          approval_type: Database['public']['Enums']['approval_type'];
          approver_id?: string | null;
          case_id: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          result: Database['public']['Enums']['approval_result'];
          updated_at?: string;
        };
        Update: {
          approval_type?: Database['public']['Enums']['approval_type'];
          approver_id?: string | null;
          case_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          result?: Database['public']['Enums']['approval_result'];
          updated_at?: string;
        };
        Relationships: [];
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
          updated_at?: string;
        };
        Relationships: [];
      };
      case_edit_grants: {
        Row: {
          case_id: string;
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          expires_at: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          note: string | null;
          target: string;
        };
        Insert: {
          case_id: string;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          expires_at: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          note?: string | null;
          target: string;
        };
        Update: {
          case_id?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          expires_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          note?: string | null;
          target?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
      cases: {
        Row: {
          address: string;
          business_name: string;
          business_reg_no: string;
          business_type: string | null;
          closed_at: string | null;
          closure_status: Database['public']['Enums']['closure_status'] | null;
          created_at: string;
          created_by: string;
          email: string | null;
          employee_count: number | null;
          exclusive_area_pyeong: number | null;
          id: string;
          item: string | null;
          lease_deposit: number | null;
          mentee_id: string | null;
          monthly_rent: number | null;
          opened_at: string | null;
          owner_name: string;
          phone: string;
          post_support_submitted_at: string | null;
          pre_support_submitted_at: string | null;
          revenue_last_year: number | null;
          status: Database['public']['Enums']['case_status'];
          support_type_id: string;
          updated_at: string;
        };
        Insert: {
          address: string;
          business_name: string;
          business_reg_no: string;
          business_type?: string | null;
          closed_at?: string | null;
          closure_status?: Database['public']['Enums']['closure_status'] | null;
          created_at?: string;
          created_by: string;
          email?: string | null;
          employee_count?: number | null;
          exclusive_area_pyeong?: number | null;
          id?: string;
          item?: string | null;
          lease_deposit?: number | null;
          mentee_id?: string | null;
          monthly_rent?: number | null;
          opened_at?: string | null;
          owner_name: string;
          phone: string;
          post_support_submitted_at?: string | null;
          pre_support_submitted_at?: string | null;
          revenue_last_year?: number | null;
          status?: Database['public']['Enums']['case_status'];
          support_type_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string;
          business_name?: string;
          business_reg_no?: string;
          business_type?: string | null;
          closed_at?: string | null;
          closure_status?: Database['public']['Enums']['closure_status'] | null;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          employee_count?: number | null;
          exclusive_area_pyeong?: number | null;
          id?: string;
          item?: string | null;
          lease_deposit?: number | null;
          mentee_id?: string | null;
          monthly_rent?: number | null;
          opened_at?: string | null;
          owner_name?: string;
          phone?: string;
          post_support_submitted_at?: string | null;
          pre_support_submitted_at?: string | null;
          revenue_last_year?: number | null;
          status?: Database['public']['Enums']['case_status'];
          support_type_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contractors: {
        Row: {
          address: string | null;
          business_reg_no: string | null;
          case_id: string;
          company_name: string;
          created_at: string;
          estimate_amount: number | null;
          id: string;
          phone: string | null;
          representative: string | null;
          updated_at: string;
          work_type: string | null;
        };
        Insert: {
          address?: string | null;
          business_reg_no?: string | null;
          case_id: string;
          company_name: string;
          created_at?: string;
          estimate_amount?: number | null;
          id?: string;
          phone?: string | null;
          representative?: string | null;
          updated_at?: string;
          work_type?: string | null;
        };
        Update: {
          address?: string | null;
          business_reg_no?: string | null;
          case_id?: string;
          company_name?: string;
          created_at?: string;
          estimate_amount?: number | null;
          id?: string;
          phone?: string | null;
          representative?: string | null;
          updated_at?: string;
          work_type?: string | null;
        };
        Relationships: [];
      };
      document_templates: {
        Row: {
          attachment_no: string | null;
          created_at: string;
          field_mapping: Json;
          html_content: string;
          id: string;
          name: string;
          support_type_id: string | null;
          template_key: string;
          updated_at: string;
        };
        Insert: {
          attachment_no?: string | null;
          created_at?: string;
          field_mapping?: Json;
          html_content: string;
          id?: string;
          name: string;
          support_type_id?: string | null;
          template_key: string;
          updated_at?: string;
        };
        Update: {
          attachment_no?: string | null;
          created_at?: string;
          field_mapping?: Json;
          html_content?: string;
          id?: string;
          name?: string;
          support_type_id?: string | null;
          template_key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          case_id: string;
          created_at: string;
          doc_key: string | null;
          doc_name: string;
          file_size: number | null;
          id: string;
          mime_type: string | null;
          sha256: string;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          doc_key?: string | null;
          doc_name: string;
          file_size?: number | null;
          id?: string;
          mime_type?: string | null;
          sha256: string;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          doc_key?: string | null;
          doc_name?: string;
          file_size?: number | null;
          id?: string;
          mime_type?: string | null;
          sha256?: string;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [];
      };
      mentor_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          case_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          mentor_id: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          case_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          mentor_id: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          case_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          mentor_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mentoring_logs: {
        Row: {
          case_id: string;
          content: string;
          created_at: string;
          difficulties: string | null;
          duration_minutes: number | null;
          id: string;
          mentor_id: string;
          place: string | null;
          result: string | null;
          topic: string | null;
          updated_at: string;
          visited_at: string;
        };
        Insert: {
          case_id: string;
          content: string;
          created_at?: string;
          difficulties?: string | null;
          duration_minutes?: number | null;
          id?: string;
          mentor_id: string;
          place?: string | null;
          result?: string | null;
          topic?: string | null;
          updated_at?: string;
          visited_at: string;
        };
        Update: {
          case_id?: string;
          content?: string;
          created_at?: string;
          difficulties?: string | null;
          duration_minutes?: number | null;
          id?: string;
          mentor_id?: string;
          place?: string | null;
          result?: string | null;
          topic?: string | null;
          updated_at?: string;
          visited_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          case_id: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          created_at: string;
          error_message: string | null;
          id: string;
          payload: Json | null;
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
          recipient_id?: string | null;
          recipient_phone?: string | null;
          sent_at?: string | null;
          status?: Database['public']['Enums']['notification_status'];
          template_code?: string | null;
          trigger_event?: string;
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
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
      payment_applications: {
        Row: {
          account_holder: string | null;
          account_number: string | null;
          amount: number | null;
          bank_name: string | null;
          case_id: string;
          content: Json;
          created_at: string;
          drafted_by: string | null;
          generated_pdf_path: string | null;
          id: string;
          report_due_date: string | null;
          updated_at: string;
        };
        Insert: {
          account_holder?: string | null;
          account_number?: string | null;
          amount?: number | null;
          bank_name?: string | null;
          case_id: string;
          content?: Json;
          created_at?: string;
          drafted_by?: string | null;
          generated_pdf_path?: string | null;
          id?: string;
          report_due_date?: string | null;
          updated_at?: string;
        };
        Update: {
          account_holder?: string | null;
          account_number?: string | null;
          amount?: number | null;
          bank_name?: string | null;
          case_id?: string;
          content?: Json;
          created_at?: string;
          drafted_by?: string | null;
          generated_pdf_path?: string | null;
          id?: string;
          report_due_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          case_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          result: Database['public']['Enums']['review_result'];
          reviewer_id: string | null;
          support_application_id: string | null;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          result: Database['public']['Enums']['review_result'];
          reviewer_id?: string | null;
          support_application_id?: string | null;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          result?: Database['public']['Enums']['review_result'];
          reviewer_id?: string | null;
          support_application_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      signatures: {
        Row: {
          case_id: string;
          created_at: string;
          document_type: string;
          id: string;
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
          sha256?: string;
          signer_name?: string | null;
          signer_type?: Database['public']['Enums']['signer_type'];
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
      support_applications: {
        Row: {
          case_id: string;
          content: Json;
          created_at: string;
          drafted_by: string | null;
          generated_pdf_path: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          case_id: string;
          content?: Json;
          created_at?: string;
          drafted_by?: string | null;
          generated_pdf_path?: string | null;
          id?: string;
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          content?: Json;
          created_at?: string;
          drafted_by?: string | null;
          generated_pdf_path?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_type_documents: {
        Row: {
          attachment_no: string | null;
          condition: string | null;
          created_at: string;
          doc_key: string;
          doc_name: string;
          id: string;
          is_required: boolean;
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
          id?: string;
          is_required?: boolean;
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
          id?: string;
          is_required?: boolean;
          sort_order?: number;
          support_type_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_types: {
        Row: {
          area_unit_price: number | null;
          calc_method: Database['public']['Enums']['calc_method'];
          code: Database['public']['Enums']['support_type_code'];
          created_at: string;
          description: string | null;
          id: string;
          limit_amount: number;
          name: string;
          updated_at: string;
        };
        Insert: {
          area_unit_price?: number | null;
          calc_method: Database['public']['Enums']['calc_method'];
          code: Database['public']['Enums']['support_type_code'];
          created_at?: string;
          description?: string | null;
          id?: string;
          limit_amount: number;
          name: string;
          updated_at?: string;
        };
        Update: {
          area_unit_price?: number | null;
          calc_method?: Database['public']['Enums']['calc_method'];
          code?: Database['public']['Enums']['support_type_code'];
          created_at?: string;
          description?: string | null;
          id?: string;
          limit_amount?: number;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          activated_at: string | null;
          created_at: string;
          email: string | null;
          id: string;
          invited_at: string | null;
          is_active: boolean;
          must_change_password: boolean;
          name: string;
          password_changed_at: string | null;
          phone: string | null;
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
          must_change_password?: boolean;
          name: string;
          password_changed_at?: string | null;
          phone?: string | null;
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
          must_change_password?: boolean;
          name?: string;
          password_changed_at?: string | null;
          phone?: string | null;
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
      approval_result: 'approved' | 'rejected';
      approval_type: 'support' | 'payment';
      calc_method: 'fixed' | 'area_cap';
      case_status:
        | 'registered'
        | 'mentor_assigned'
        | 'contacted'
        | 'log_completed'
        | 'contractor_registered'
        | 'application_drafted'
        | 'under_review'
        | 'reviewed'
        | 'approved'
        | 'rejected'
        | 'notified'
        | 'execution_docs_submitted'
        | 'payment_application_drafted'
        | 'payment_approved'
        | 'withdrawn';
      closure_status: 'closed' | 'pending';
      notification_channel: 'alimtalk' | 'sms';
      notification_status: 'pending' | 'sent' | 'failed' | 'fallback_sent';
      review_result: 'approved' | 'revision_requested';
      signer_type: 'mentor' | 'mentee' | 'contractor';
      support_type_code: 'management_improvement' | 'closure';
      user_role: 'institution' | 'nextlab' | 'mentor' | 'mentee';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database['public'];

export type Tables<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update'];
export type Enums<T extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][T];
