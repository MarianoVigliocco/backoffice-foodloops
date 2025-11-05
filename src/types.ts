export type UserRow = {
  id_user: number;
  name: string;
  last_name: string | null;
  email: string;
  created_at: string;
  enabled: boolean;
  country?: string | null;
};
