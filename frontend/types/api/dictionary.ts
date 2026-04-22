import type { UserRole } from "@/lib/types";

export type DictionaryEntryDto = {
  id: string;
  term: string;
  synonyms: string[];
  sql_expression: string;
  visibility_roles: UserRole[];
  updated_at?: string;
};

export type UpsertDictionaryEntryDto = {
  term: string;
  synonyms: string[];
  sql_expression: string;
  visibility_roles: UserRole[];
};
