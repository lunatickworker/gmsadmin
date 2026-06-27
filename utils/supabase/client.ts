import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

export const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createClient(
  supabaseUrl,
  publicAnonKey
);

// Edge function 기본 URL - swift-api로 배포됨
export const SERVER_URL = `https://${projectId}.supabase.co/functions/v1/swift-api/make-server-cd65d9bc`;
