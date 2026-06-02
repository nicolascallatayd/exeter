import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { uploadKycDocuments, type KycDocument } from "@/lib/cloudinary";

// ─── Types ────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "suspended" | "frozen" | "on_hold";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  profile_data?: Record<string, unknown> | null;
  approval_status: ApprovalStatus;
  phone_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  lastVerified: number | null;
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  reauth: (password: string) => Promise<{ error: string | null }>;
  signup: (
    name: string,
    email: string,
    password: string,
    profileData?: {
      phone?: string | null;
      dateOfBirth?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
      kycDocuments?: { type: KycDocument["type"]; file: File }[];
    }
  ) => Promise<{ error: AuthError | null }>;
  logout: () => Promise<void>;
}

export const REAUTH_GRACE_MS = 60_000;

// ─── Context ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

// ─── Helpers ──────────────────────────────────────────────────

const fetchProfile = async (userId: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data as Profile;
};

// ─── Provider ─────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser]               = useState<User | null>(null);
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [session, setSession]         = useState<Session | null>(null);
  const [loading, setLoading]         = useState(true);
  const [lastVerified, setLastVerified] = useState<number | null>(null);
  const [isLocked, setIsLocked]       = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Seed state from the locally-stored session immediately so the app
    // doesn't block on the network refresh before rendering.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchProfile(session.user.id).then(setProfile);
        } else {
          setProfile(null);
          setLastVerified(null);
          setIsLocked(false);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Refresh profile ───────────────────────────────────────

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  };

  // ── Lock / Unlock ─────────────────────────────────────────

  const lock = () => setIsLocked(true);

  const unlock = () => {
    setLastVerified(Date.now());
    setIsLocked(false);
  };

  // ── Login ─────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      setLastVerified(Date.now());
      setIsLocked(false);
    }
    return { error };
  };

  // ── Reauth ────────────────────────────────────────────────

  const reauth = async (password: string): Promise<{ error: string | null }> => {
    if (!user?.email) return { error: "No active session." };

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error) {
      if (error.message.toLowerCase().includes("invalid login")) {
        return { error: "Incorrect password. Please try again." };
      }
      return { error: error.message };
    }

    unlock();
    return { error: null };
  };

  // ── Signup ────────────────────────────────────────────────

  const signup = async (
    name: string,
    email: string,
    password: string,
    profileData?: {
      phone?: string | null;
      dateOfBirth?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
      kycDocuments?: { type: KycDocument["type"]; file: File }[];
    }
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (!error && data?.user?.id) {
      const userId = data.user.id;

      // Upload KYC documents to Cloudinary
      let kycDocs: KycDocument[] = [];
      if (profileData?.kycDocuments?.length) {
        try {
          kycDocs = await uploadKycDocuments(profileData.kycDocuments, userId);
        } catch (uploadError) {
          return { error: { message: String((uploadError as Error).message) } as AuthError };
        }
      }

      const newProfileData: Record<string, unknown> = {
        phone:          profileData?.phone ?? null,
        date_of_birth:  profileData?.dateOfBirth ?? null,
        address_line_1: profileData?.addressLine1 ?? null,
        address_line_2: profileData?.addressLine2 ?? null,
        city:           profileData?.city ?? null,
        state:          profileData?.state ?? null,
        postal_code:    profileData?.postalCode ?? null,
        country:        profileData?.country ?? null,
        kyc_documents:  kycDocs,
      };

      // Upsert in case Supabase's auth trigger already created the row.
      // approval_status defaults to 'pending' in DB for new rows.
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id:           userId,
          email,
          full_name:    name,
          profile_data: newProfileData,
        }, { onConflict: "id" });

      if (profileError) {
        console.error("Profile creation failed:", profileError.message);
      }

      setLastVerified(Date.now());
    }

    return { error };
  };

  // ── Logout ────────────────────────────────────────────────

  const logout = async () => {
    await supabase.auth.signOut();
    setLastVerified(null);
    setIsLocked(false);
    navigate("/");
  };

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading,
      lastVerified, isLocked, lock, unlock,
      refreshProfile, login, reauth, signup, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
