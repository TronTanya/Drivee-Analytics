export type AdminSqlPolicyDto = {
  extra_whitelist_tables: string[];
  extra_whitelist_columns: string[];
  nl_max_result_rows: number | null;
  effective_whitelist_tables: string[];
  effective_whitelist_columns: string[];
  effective_sql_default_limit: number;
};

export type AdminSqlPolicyUpdateDto = {
  extra_whitelist_tables: string[];
  extra_whitelist_columns: string[];
  nl_max_result_rows: number | null;
};
