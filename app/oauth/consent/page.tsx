"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { Check, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import styles from "./styles.module.css";

type AuthorizationDetails = {
  authorization_id: string;
  scope: string;
  redirect_uri: string;
  client: {
    id?: string;
    name?: string;
    uri?: string;
    logo_uri?: string;
  };
};

export default function OAuthConsentPage() {
  const [authorizationId, setAuthorizationId] = useState("");
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAuthorization(id: string) {
    if (!supabase) {
      setMessage("La conexión segura no está configurada.");
      return;
    }
    const response = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (response.error || !response.data) {
      setMessage("La solicitud de conexión no es válida o ya expiró.");
      return;
    }
    if ("redirect_url" in response.data) {
      window.location.assign(response.data.redirect_url);
      return;
    }
    setDetails(response.data as AuthorizationDetails);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      const id = new URLSearchParams(window.location.search).get(
        "authorization_id",
      );
      if (!id || id.length > 500) {
        setMessage("Falta la solicitud segura de conexión.");
        setSessionReady(true);
        return;
      }
      setAuthorizationId(id);
      if (!supabase) {
        setMessage("La conexión segura no está configurada.");
        setSessionReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      setSessionReady(true);
      if (hasSession) void loadAuthorization(id);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const response = await supabase.auth.signInWithPassword({
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || ""),
    });
    if (response.error) {
      setMessage("Correo o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    setSignedIn(true);
    await loadAuthorization(authorizationId);
    setBusy(false);
  }

  async function decide(approve: boolean) {
    if (!supabase || !authorizationId || busy) return;
    setBusy(true);
    setMessage("");
    const response = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });
    if (response.error || !response.data?.redirect_url) {
      setMessage("No pudimos completar la autorización. Intenta de nuevo.");
      setBusy(false);
      return;
    }
    window.location.assign(response.data.redirect_url);
  }

  const scopes = (details?.scope || "")
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <Image src="/spartanblue-logo.png" alt="Spartanblue" width={210} height={86} priority />
          <span>Workspace</span>
        </div>

        {!sessionReady ? (
          <div className={styles.loading}>Preparando conexión segura…</div>
        ) : !signedIn ? (
          <>
            <div className={styles.heading}>
              <LockKeyhole size={28} />
              <div>
                <h1>Inicia sesión para conectar</h1>
                <p>Usa la misma cuenta de Spartanblue.</p>
              </div>
            </div>
            <form className={styles.form} onSubmit={signIn}>
              <label>
                Correo electrónico
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Contraseña
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? "Verificando…" : "Continuar"}
              </button>
            </form>
          </>
        ) : details ? (
          <>
            <div className={styles.heading}>
              <ShieldCheck size={30} />
              <div>
                <h1>Autorizar al agente</h1>
                <p>
                  <strong>{details.client?.name || "Agente de ChatGPT"}</strong>{" "}
                  solicita acceso a tu Workspace.
                </p>
              </div>
            </div>
            <div className={styles.permissions}>
              <h2>Podrá trabajar en tu nombre para:</h2>
              {[
                "Consultar proyectos, personas, tareas, mensajes y minutas",
                "Crear, mejorar, asignar, mover y comentar to-dos",
                "Publicar cambios solo dentro de tus permisos actuales",
              ].map((permission) => (
                <div key={permission}>
                  <Check size={18} />
                  <span>{permission}</span>
                </div>
              ))}
            </div>
            {scopes.length > 0 && (
              <p className={styles.scopeText}>
                Datos de identidad solicitados: {scopes.join(", ")}.
              </p>
            )}
            <p className={styles.notice}>
              El agente nunca recibe tu contraseña y Supabase aplica los mismos permisos que tienes dentro de la app. Puedes negar esta conexión ahora.
            </p>
            <div className={styles.actions}>
              <button className={styles.deny} onClick={() => void decide(false)} disabled={busy}>
                <X size={18} />
                No autorizar
              </button>
              <button className={styles.approve} onClick={() => void decide(true)} disabled={busy}>
                <ShieldCheck size={18} />
                {busy ? "Autorizando…" : "Autorizar agente"}
              </button>
            </div>
          </>
        ) : null}

        {message && <p className={styles.error}>{message}</p>}
        <footer>Conexión OAuth 2.1 protegida por Supabase</footer>
      </section>
    </main>
  );
}
