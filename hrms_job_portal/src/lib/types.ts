export interface PortalCompanySummary {
  id: number;
  name: string;
  logo_url?: string;
  industry?: string;
  city?: string;
  state?: string;
  is_verified: boolean;
  job_count?: number;
}

export interface PortalJobSummary {
  id: number;
  title: string;
  slug?: string;
  description: string;
  location: string;
  city?: string;
  state?: string;
  employment_type: string;
  work_mode?: string;
  experience_min?: number;
  experience_max?: number;
  salary_min?: number;
  salary_max?: number;
  skills_required?: string[];
  published_at?: string;
  application_deadline?: string;
  is_remote?: boolean;
  is_urgent?: boolean;
  is_featured?: boolean;
  company: PortalCompanySummary;
}

export interface PortalJobDetail extends PortalJobSummary {
  responsibilities?: string;
  requirements?: string;
  benefits?: string;
  education_required?: string;
  vacancy_count?: number;
  application_count?: number;
  view_count?: number;
  tags?: string[];
}

export interface PortalCompanyDetail {
  id: number;
  name: string;
  description?: string;
  logo_url?: string;
  cover_image_url?: string;
  website?: string;
  industry?: string;
  company_size?: string;
  headquarters?: string;
  founded_year?: number;
  email?: string;
  phone?: string;
  city: string;
  state: string;
  country: string;
  is_verified: boolean;
  is_featured: boolean;
  jobs: Array<{
    id: number;
    title: string;
    slug: string;
    employment_type: string;
    location: string;
    is_remote: boolean;
    published_at: string;
  }>;
}

export interface PortalApplication {
  id: number;
  job: { id: number; title: string; company: string; location: string; employment_type: string };
  status: string;
  applied_at: string;
  feedback?: string;
}

export type ProfileType = 'fresher' | 'experienced' | 'freelancer';

export interface PortalProfile {
  id?: number;
  full_name: string;
  email: string;
  phone?: string;
  headline?: string;
  summary?: string;
  profile_type?: ProfileType;
  current_designation?: string;
  current_company?: string;
  location?: string;
  city: string;
  state: string;
  country?: string;
  pincode?: string;
  profile_picture?: string;
  skills: string[];
  languages?: string[];
  experience_years: number;
  education?: Array<Record<string, any>>;
  work_experience?: Array<Record<string, any>>;
  certifications?: Array<Record<string, any>>;
  projects?: Array<Record<string, any>>;
  achievements?: Array<Record<string, any>>;
  services?: Array<Record<string, any>>;
  resume_url?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  github_url?: string;
  expected_salary_min?: number;
  expected_salary_max?: number;
  current_salary?: number;
  hourly_rate_min?: number;
  hourly_rate_max?: number;
  availability?: string;
  notice_period?: string;
  employment_type_preference?: string;
  remote_preference?: string;
  profile_visibility?: string;
  is_open_to_opportunities?: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface PortalMember {
  id: number;
  full_name: string;
  profile_picture?: string;
  headline?: string;
  city?: string;
  state?: string;
  profile_type: ProfileType;
  skills: string[];
  experience_years: number;
  is_verified: boolean;
}

export interface PortalMemberDetail {
  id: number;
  full_name: string;
  profile_picture?: string;
  headline?: string;
  summary?: string;
  current_designation?: string;
  current_company?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  resume_url?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  github_url?: string;
  skills: string[];
  experience_years: number;
  education?: Array<Record<string, any>>;
  work_experience?: Array<Record<string, any>>;
  certifications?: Array<Record<string, any>>;
  projects?: Array<Record<string, any>>;
  is_verified: boolean;
  is_featured: boolean;
}
