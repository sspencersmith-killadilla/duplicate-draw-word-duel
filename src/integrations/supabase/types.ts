export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_explanation_access_state: {
        Row: {
          id: string
          message: string
          status: number
          updated_at: string
        }
        Insert: {
          id: string
          message: string
          status: number
          updated_at?: string
        }
        Update: {
          id?: string
          message?: string
          status?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_deals: {
        Row: {
          bot_number: number | null
          created_at: string
          deal_date: string
          id: string
          kind: string
        }
        Insert: {
          bot_number?: number | null
          created_at?: string
          deal_date: string
          id?: string
          kind?: string
        }
        Update: {
          bot_number?: number | null
          created_at?: string
          deal_date?: string
          id?: string
          kind?: string
        }
        Relationships: []
      }
      deal_secrets: {
        Row: {
          deal_id: string
          north_tiles: string
          south_tiles: string
        }
        Insert: {
          deal_id: string
          north_tiles: string
          south_tiles: string
        }
        Update: {
          deal_id?: string
          north_tiles?: string
          south_tiles?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_secrets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "daily_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      game_secrets: {
        Row: {
          game_id: string
          north_rack: string
          north_stream: string
          south_rack: string
          south_stream: string
        }
        Insert: {
          game_id: string
          north_rack?: string
          north_stream?: string
          south_rack?: string
          south_stream?: string
        }
        Update: {
          game_id?: string
          north_rack?: string
          north_stream?: string
          south_rack?: string
          south_stream?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_secrets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          board: Json
          consecutive_passes: number
          created_at: string
          deal_id: string
          finished_at: string | null
          id: string
          last_move_at: string
          north_id: string
          north_rack_count: number
          north_remaining: number
          north_score: number
          south_id: string | null
          south_rack_count: number
          south_remaining: number
          south_score: number
          status: string
          turn: string
          vs_bot: boolean
        }
        Insert: {
          board?: Json
          consecutive_passes?: number
          created_at?: string
          deal_id: string
          finished_at?: string | null
          id?: string
          last_move_at?: string
          north_id: string
          north_rack_count?: number
          north_remaining?: number
          north_score?: number
          south_id?: string | null
          south_rack_count?: number
          south_remaining?: number
          south_score?: number
          status?: string
          turn?: string
          vs_bot?: boolean
        }
        Update: {
          board?: Json
          consecutive_passes?: number
          created_at?: string
          deal_id?: string
          finished_at?: string | null
          id?: string
          last_move_at?: string
          north_id?: string
          north_rack_count?: number
          north_remaining?: number
          north_score?: number
          south_id?: string | null
          south_rack_count?: number
          south_remaining?: number
          south_score?: number
          status?: string
          turn?: string
          vs_bot?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "games_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "daily_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      moves: {
        Row: {
          created_at: string
          game_id: string
          id: string
          kind: string
          player_id: string
          score: number
          seat: string
          words: string[]
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          kind: string
          player_id: string
          score?: number
          seat: string
          words?: string[]
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          kind?: string
          player_id?: string
          score?: number
          seat?: string
          words?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "moves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
