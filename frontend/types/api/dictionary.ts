import type { UserRole } from "@/lib/types";

export type DictionaryEntryDto = {
  id: string;
  term: string;
  synonyms: string[];
  sql_expression: string;
  visibility_roles: UserRole[];
  updated_at?: string;
  domain?: string;
  canonical_metric_key?: string;
  source_table?: string;
  source_column?: string | null;
  aggregation_type?: string;
  term_type?: string;
  target_field?: string | null;
  filter_value?: string | null;
  description_ru?: string;
  constraints?: Record<string, unknown>;
  example_queries?: string[];
  system_interpretation_ru?: string;
};

export type UpsertDictionaryEntryDto = {
  term: string;
  synonyms: string[];
  sql_expression: string;
  visibility_roles: UserRole[];
  domain?: string;
  canonical_metric_key?: string;
  source_table?: string;
  source_column?: string | null;
  aggregation_type?: string;
  term_type?: string;
  target_field?: string | null;
  filter_value?: string | null;
  description_ru?: string;
  constraints?: Record<string, unknown>;
  example_queries?: string[];
  system_interpretation_ru?: string;
};

export type DictionaryMetaDto = {
  version: string;
  source: string;
  term_count: number;
  updated_at?: string | null;
};
