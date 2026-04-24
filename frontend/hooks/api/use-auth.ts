"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, login, logoutClient, patchMyProfile, register } from "@/lib/api/auth";
import { queryKeys } from "@/hooks/api/query-keys";
import type { LoginRequestDto, RegisterRequestDto, UserProfilePatchDto } from "@/types/api/auth";

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: fetchCurrentUser,
    enabled,
    staleTime: 60_000
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequestDto) => login(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.auth.me(), data.user);
    }
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequestDto) => register(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.auth.me(), data.user);
    }
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      logoutClient();
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: queryKeys.auth.all });
    }
  });
}

export function usePatchMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserProfilePatchDto) => patchMyProfile(body),
    onSuccess: (user) => {
      qc.setQueryData(queryKeys.auth.me(), user);
    }
  });
}
