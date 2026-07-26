import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileText,
  GitBranch,
  HelpCircle,
  Home,
  Layers3,
  Library,
  Lightbulb,
  Loader2,
  Menu,
  PenLine,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle,
  X,
} from "lucide-react";
import {
  createManualActivityItemsFromText,
  createGitHubActivityItemsFromPayloads,
  parseGitHubRepoInput,
  generateDeterministicLaunchClusters,
  generateDeterministicOpportunities,
} from "@/core/launchrelay-core.mjs";
import { createGuardrailedDraft } from "@/core/content-guardrails.mjs";

const ProductWorkspace = base44.entities.ProductWorkspace;
const ActivityItem = base44.entities.ActivityItem;
const SourceConnection = base44.entities.SourceConnection;
const LaunchCluster = base44.entities.LaunchCluster;
const Draft = base44.entities.Draft;
const Opportunity = base44.entities.Opportunity;

const appNav = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "sources", label: "Sources", icon: GitBranch },
  { id: "launch-moments", label: "Launch Moments", icon: CircleDot },
  { id: "story-studio", label: "Story Studio", icon: PenLine },
  { id: "opportunities", label: "Opportunities", icon: Lightbulb },
  { id: "library", label: "Library", icon: Library },
];

const appRouteIds = [...appNav.map((item) => item.id), "settings", "help"];
const publicRouteIds = ["public-home", "sign-in"];
const publicNav = ["Product", "How it works", "Use cases"];

const sampleActivity = `PR: Added onboarding checklist for first workspace setup
Commit: fixed signup redirect after account creation
Note: users were confused after account creation, so we added clearer first-run guidance
Feature: added welcome screen copy that explains the next best action`;

const initialWorkspace = {
  name: "LaunchRelay",
  description: "A GitHub-first product education workflow system for shipped software changes.",
  target_audience: "Product educators, devrel teams, product marketing, and founders",
  product_stage: "MVP",
  primary_repo_url: "https://github.com/everyoya/launchrelay",
  primary_channels: "blog, docs, release notes, launch posts",
  positioning_notes: "Strategic coproducer for strong teams, not a generic AI writer.",
  terminology_notes: "Use launch moments, shipped work, product education, story coproduction.",
  style_guidance: "Clear, respectful, source-grounded, practical, non-hypey.",
};

const nowLabel = "Today";

export default function App() {
  const [view, setView] = useState(() => initialViewFromLocation());
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [workspaceRecord, setWorkspaceRecord] = useState(null);
  const [activityText, setActivityText] = useState(sampleActivity);
  const [githubRepoInput, setGithubRepoInput] = useState(initialWorkspace.primary_repo_url);
  const [activities, setActivities] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [draft, setDraft] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [sourceTab, setSourceTab] = useState("context");
  const [libraryTab, setLibraryTab] = useState("Drafts");
  const [settingsTab, setSettingsTab] = useState("general");
  const [launchFilter, setLaunchFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [importPhase, setImportPhase] = useState("idle");
  const [status, setStatus] = useState(null);

  const lockedAppRoute = !currentUser && !demoMode && isAppRoute(view);
  const renderedView = lockedAppRoute ? "sign-in" : view;
  const isPublic = renderedView.startsWith("public") || renderedView === "sign-in";

  useEffect(() => {
    const syncRoute = () => {
      const nextView = initialViewFromLocation();
      setView((currentView) => (currentView === nextView ? currentView : nextView));
    };
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        hydrateAuthTokenFromUrl();
        const user = normalizeResponse(await base44.auth.me());
        if (!isValidUserSession(user)) throw new Error("No active Base44 user session");
        if (cancelled) return;
        setDemoMode(false);
        setCurrentUser(user);
        resetWorkspaceState({ setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities });
        await loadUserWorkspaceData(user, { setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities });
        if (cancelled) return;
        const routeView = initialViewFromLocation();
        const postLoginView = consumePostLoginView();
        if (isAppRoute(postLoginView)) {
          goApp(postLoginView, { replace: true });
        } else if (routeView === "sign-in") {
          goApp("overview", { replace: true });
        }
      } catch (error) {
        if (cancelled) return;
        clearLocalAuthToken();
        setCurrentUser(null);
        if (isAppRoute(initialViewFromLocation())) {
          setStatus({ tone: "warning", message: "Sign in to continue to your workspace." });
          goPublic("sign-in", { replace: true });
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status || status.tone === "loading") return undefined;
    const timer = window.setTimeout(() => setStatus(null), 3600);
    return () => window.clearTimeout(timer);
  }, [status]);

  const acceptedCluster = useMemo(
    () => clusters.find((cluster) => cluster.status === "accepted" || cluster.status === "edited") || null,
    [clusters]
  );
  const selectedSources = useMemo(
    () => activities.filter((item) => selectedCluster?.activity_item_ids?.includes(item.id)),
    [activities, selectedCluster]
  );
  const acceptedSources = useMemo(
    () => activities.filter((item) => acceptedCluster?.activity_item_ids?.includes(item.id)),
    [activities, acceptedCluster]
  );
  const visibleOpportunities = opportunities.filter((item) => item.status !== "ignored");
  const draftRows = draft ? [draft] : [];

  function goApp(nextView, options = {}) {
    setView(nextView);
    setSidebarOpen(false);
    setUserMenuOpen(false);
    writeViewToUrl(nextView, options);
  }

  function goPublic(nextView = "public-home", options = {}) {
    setView(nextView);
    setSidebarOpen(false);
    setUserMenuOpen(false);
    writeViewToUrl(nextView, options);
  }

  function enterSystem(nextView = "overview") {
    goApp(nextView);
  }

  function startAuthProviderLogin(provider) {
    rememberPostLoginView("overview");
    base44.auth.loginWithProvider(provider, `${window.location.origin}${window.location.pathname}#/overview`);
  }

  async function completeAuthenticatedEntry(user) {
    if (!isValidUserSession(user)) throw new Error("No active Base44 user session");
    setDemoMode(false);
    resetWorkspaceState({ setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities });
    setCurrentUser(user);
    setStatus({ tone: "loading", message: "Opening your workspace..." });
    await loadUserWorkspaceData({ setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities }, user);
    setStatus({ tone: "success", message: "Workspace opened." });
    goApp("overview", { replace: true });
  }

  async function logout() {
    setDemoMode(false);
    setCurrentUser(null);
    resetWorkspaceState({ setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities });
    forgetPostLoginView();
    clearLocalAuthToken();
    base44.auth.logout(`${window.location.origin}${window.location.pathname}`);
  }


  async function saveWorkspace() {
    setIsBusy(true);
    setStatus({ tone: "loading", message: "Saving workspace context..." });
    try {
      const record = workspaceRecord
        ? await ProductWorkspace.update(workspaceRecord.id, workspace)
        : await ProductWorkspace.create(workspace);
      setWorkspaceRecord(record);
      setStatus({ tone: "success", message: "Workspace context saved. Import source activity next." });
      goApp("sources");
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Could not save remotely yet. LaunchRelay kept this workspace local so the workflow can continue." });
      setWorkspaceRecord({ id: "local_workspace", ...workspace });
      goApp("sources");
    } finally {
      setIsBusy(false);
    }
  }

  async function ensureWorkspaceRecord() {
    if (workspaceRecord?.id && !String(workspaceRecord.id).startsWith("local_")) return workspaceRecord;
    if (!currentUser || demoMode) {
      const localRecord = workspaceRecord || { id: "local_workspace", ...workspace };
      setWorkspaceRecord(localRecord);
      return localRecord;
    }
    try {
      const created = await ProductWorkspace.create(workspace);
      setWorkspaceRecord(created);
      setWorkspace({ ...initialWorkspace, ...created });
      return created;
    } catch (error) {
      console.error(error);
      const localRecord = { id: "local_workspace", ...workspace };
      setWorkspaceRecord(localRecord);
      setStatus({ tone: "warning", message: "Could not create the remote workspace yet. This session can continue locally, but sign back in after saving context to persist it." });
      return localRecord;
    }
  }

  function startOnboardingWorkflow() {
    const workspaceRecordSeed = { id: "local_workspace", ...workspace };
    const importedAt = new Date().toISOString();
    const seededActivities = createManualActivityItemsFromText(sampleActivity, {
      workspaceId: workspaceRecordSeed.id,
      importedAt,
      idPrefix: "onboarding_activity",
    });
    const seededClusters = generateDeterministicLaunchClusters(seededActivities, {
      workspaceId: workspaceRecordSeed.id,
      targetAudience: workspace.target_audience,
      manualContext: workspace.positioning_notes,
    }).map((cluster, index) => ({ ...cluster, id: `local_cluster_${index + 1}` }));

    setDemoMode(true);
    setWorkspaceRecord(workspaceRecordSeed);
    setActivityText(sampleActivity);
    setActivities(seededActivities);
    setClusters(seededClusters);
    setSelectedCluster(seededClusters[0] || null);
    setDraft(null);
    setOpportunities([]);
    setImportPhase("complete");
    setStatus({ tone: "success", message: "Sample workspace loaded with source activity and a suggested launch moment." });
    goApp("overview");
  }

  async function importManualActivity() {
    setIsBusy(true);
    setImportPhase("normalizing");
    setStatus({ tone: "loading", message: "Normalizing pasted activity into source records..." });
    const activeWorkspace = await ensureWorkspaceRecord();
    const workspaceId = activeWorkspace.id;
    const importedAt = new Date().toISOString();

    try {
      const response = await base44.functions.invoke("normalizeActivity", {
        activityText,
        workspaceId,
        importedAt,
        idPrefix: "backend_activity",
      });
      const normalized = response.data.activityItems || [];
      const saved = [];
      for (const item of normalized) {
        const { id, ...payload } = item;
        saved.push(await ActivityItem.create(payload));
      }
      setActivities(saved);
      setImportPhase("complete");
      setStatus({ tone: "success", message: `Imported ${saved.length} activity items and kept their source trail.` });
    } catch (error) {
      console.error(error);
      const normalized = createManualActivityItemsFromText(activityText, {
        workspaceId,
        importedAt,
        idPrefix: "local_activity",
      });
      setActivities(normalized.map((item, index) => ({ ...item, id: item.id || `local_activity_${index + 1}` })));
      setImportPhase("complete");
      setStatus({ tone: "warning", message: "Imported pasted activity locally with the same source-grounded workflow." });
    } finally {
      setIsBusy(false);
    }
  }

  async function importGitHubActivity() {
    setIsBusy(true);
    setImportPhase("connecting");
    setStatus({ tone: "loading", message: "Connecting to GitHub source activity..." });
    const parsed = parseGitHubRepoInput(githubRepoInput);

    if (!parsed.isValid) {
      setStatus({ tone: "error", message: parsed.error });
      setImportPhase("error");
      setIsBusy(false);
      return;
    }

    const activeWorkspace = await ensureWorkspaceRecord();
    const workspaceId = activeWorkspace.id;
    const importedAt = new Date().toISOString();

    try {
      const connectionPayload = {
        workspace_id: workspaceId,
        source_type: "github",
        connection_mode: "manual_repo_url",
        repo_owner: parsed.repoOwner,
        repo_name: parsed.repoName,
        repo_url: parsed.repoUrl,
        status: "active",
        last_imported_at: importedAt,
      };
      let sourceConnectionId = null;
      try {
        const connection = await SourceConnection.create(connectionPayload);
        sourceConnectionId = connection.id;
      } catch (connectionError) {
        console.warn(connectionError);
      }

      setImportPhase("fetching");
      const response = await invokeFunctionWithTimeout("importPublicGitHubActivity", {
        repoInput: githubRepoInput,
        workspaceId,
        sourceConnectionId,
        importedAt,
      });
      setImportPhase("deduplicating");
      const imported = response.data.activityItems || [];
      const existingKeys = new Set(activities.map((item) => item.dedupe_key || `${item.source_type}:${item.source_id}:${item.title}`));
      const uniqueImported = imported.filter((item) => {
        const key = item.dedupe_key || `${item.source_type}:${item.source_id}:${item.title}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      const saved = [];
      for (const item of uniqueImported) {
        const { id, ...payload } = item;
        saved.push(await ActivityItem.create(payload));
      }
      setActivities((items) => [...items, ...saved]);
      setImportPhase("complete");
      setStatus({ tone: "success", message: `Imported ${saved.length} new GitHub activities from ${parsed.repoOwner}/${parsed.repoName}.` });
    } catch (error) {
      console.error(error);
      try {
        setImportPhase("fetching");
        const githubPayloads = await fetchPublicGitHubPayloads(parsed.repoOwner, parsed.repoName);
        const imported = createGitHubActivityItemsFromPayloads(githubPayloads, {
          workspaceId,
          sourceConnectionId: null,
          repoOwner: parsed.repoOwner,
          repoName: parsed.repoName,
          importedAt,
        });
        setImportPhase("deduplicating");
        const existingKeys = new Set(activities.map((item) => item.dedupe_key || `${item.source_type}:${item.source_id}:${item.title}`));
        const uniqueImported = imported.filter((item) => {
          const key = item.dedupe_key || `${item.source_type}:${item.source_id}:${item.title}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });
        const saved = [];
        for (const item of uniqueImported) {
          const { id, ...payload } = item;
          saved.push(await ActivityItem.create(payload));
        }
        setActivities((items) => [...items, ...saved]);
        setImportPhase("complete");
        setStatus({ tone: "warning", message: `Imported ${saved.length} new GitHub activities through the browser fallback from ${parsed.repoOwner}/${parsed.repoName}.` });
      } catch (fallbackError) {
        console.error(fallbackError);
        setImportPhase("error");
        setStatus({ tone: "error", message: "GitHub import could not complete. Paste shipped-work notes below to keep moving." });
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function detectLaunchMoments() {
    if (!activities.length) {
      setStatus({ tone: "warning", message: "Import or paste source activity first." });
      goApp("sources");
      return;
    }
    setIsBusy(true);
    setStatus({ tone: "loading", message: "Detecting launch-worthy change clusters..." });
    const activeWorkspace = await ensureWorkspaceRecord();
    const workspaceId = activeWorkspace.id;

    try {
      const response = await invokeFunctionWithTimeout("detectLaunchMoments", {
        activityItems: activities,
        workspaceId,
        targetAudience: workspace.target_audience,
        manualContext: workspace.positioning_notes,
      });
      const generated = response.data.launchClusters || [];
      const saved = [];
      for (const cluster of generated) {
        const { id, ...payload } = cluster;
        saved.push(await LaunchCluster.create(payload));
      }
      setClusters(saved);
      setSelectedCluster(saved[0] || null);
      setStatus({ tone: "success", message: "Launch moments detected and saved with source links." });
      goApp("launch-moments");
    } catch (error) {
      console.error(error);
      const generated = generateDeterministicLaunchClusters(activities, {
        workspaceId,
        targetAudience: workspace.target_audience,
        manualContext: workspace.positioning_notes,
      });
      const local = generated.map((cluster, index) => ({ ...cluster, id: cluster.id || `local_cluster_${index + 1}` }));
      setClusters(local);
      setSelectedCluster(local[0] || null);
      setStatus({ tone: "warning", message: "Launch moments detected locally with source links." });
      goApp("launch-moments");
    } finally {
      setIsBusy(false);
    }
  }

  async function acceptCluster(cluster) {
    const updated = { ...cluster, status: "accepted" };
    setSelectedCluster(updated);
    setClusters((items) => items.map((item) => (item.id === cluster.id ? updated : item)));
    setStatus({ tone: "success", message: "Human review complete. Opening Story Studio." });
    goApp("story-studio");
    try {
      if (cluster.id && !String(cluster.id).startsWith("local_")) await LaunchCluster.update(cluster.id, { status: "accepted" });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Launch moment accepted locally. Opening Story Studio." });
    }
  }

  async function createDraft() {
    if (!acceptedCluster) {
      setStatus({ tone: "warning", message: "Accept a launch moment before creating a draft." });
      goApp("launch-moments");
      return;
    }
    setIsBusy(true);
    setStatus({ tone: "loading", message: "Creating a source-grounded draft with guardrails..." });
    const sourceItems = activities.filter((item) => acceptedCluster.activity_item_ids?.includes(item.id));
    const activeWorkspace = await ensureWorkspaceRecord();
    const guardrailed = createGuardrailedDraft({ workspace, cluster: acceptedCluster, sources: sourceItems });
    const draftPayload = {
      workspace_id: activeWorkspace.id,
      launch_cluster_id: acceptedCluster.id,
      draft_type: "feature_launch",
      title: guardrailed.title,
      body: guardrailed.body,
      status: "draft",
      source_summary: `Generated from ${sourceItems.length} accepted source activities with the ${guardrailed.template_label} harness and ${guardrailed.psychological_driver} driver.`,
      generation_inputs_snapshot: JSON.stringify({ workspace, cluster: acceptedCluster, guardrails: guardrailed }),
      source_activity_item_ids: acceptedCluster.activity_item_ids || [],
    };

    try {
      const saved = await Draft.create(draftPayload);
      setDraft(saved);
      setStatus({ tone: "success", message: "Draft saved with source references and guardrail metadata." });
    } catch (error) {
      console.error(error);
      setDraft({ ...draftPayload, id: "local_draft_1" });
      setStatus({ tone: "warning", message: "Draft created locally with source references and guardrail metadata." });
    } finally {
      setIsBusy(false);
    }
  }

  async function createOpportunities() {
    if (!acceptedCluster) {
      setStatus({ tone: "warning", message: "Accept a launch moment before expanding opportunities." });
      goApp("launch-moments");
      return;
    }
    setIsBusy(true);
    setStatus({ tone: "loading", message: "Expanding one shipped moment into follow-up education opportunities..." });
    const activeWorkspace = await ensureWorkspaceRecord();
    const workspaceId = activeWorkspace.id;

    try {
      const response = await invokeFunctionWithTimeout("expandOpportunities", { cluster: acceptedCluster, workspaceId });
      const generated = response.data.opportunities || [];
      const saved = [];
      for (const opportunity of generated) saved.push(await Opportunity.create(opportunity));
      setOpportunities(saved);
      setStatus({ tone: "success", message: "Five follow-up education opportunities created." });
      goApp("opportunities");
    } catch (error) {
      console.error(error);
      const generated = generateDeterministicOpportunities(acceptedCluster, { workspaceId });
      setOpportunities(generated.map((item, index) => ({ ...item, id: `local_opportunity_${index + 1}` })));
      setStatus({ tone: "warning", message: "Five follow-up education opportunities created locally." });
      goApp("opportunities");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveOpportunity(opportunity) {
    const updated = { ...opportunity, status: "saved" };
    setOpportunities((items) => items.map((item) => (sameOpportunity(item, opportunity) ? updated : item)));
    try {
      if (opportunity.id && !String(opportunity.id).startsWith("local_")) await Opportunity.update(opportunity.id, { status: "saved" });
      setStatus({ tone: "success", message: "Opportunity saved to Library." });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Opportunity saved locally for this session." });
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const savedAt = new Date().toISOString();
    const updated = { ...draft, updated_at: savedAt };
    setDraft(updated);
    try {
      if (draft.id && !String(draft.id).startsWith("local_")) {
        await Draft.update(draft.id, { title: draft.title, body: draft.body, status: draft.status || "draft" });
      }
      setStatus({ tone: "success", message: "Draft saved and kept visible in Library." });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Draft saved locally for this session. Remote save can be retried later." });
    }
  }

  async function markDraftReady() {
    if (!draft) return;
    const updated = { ...draft, status: "ready", updated_at: new Date().toISOString() };
    setDraft(updated);
    setLibraryTab("Ready");
    try {
      if (draft.id && !String(draft.id).startsWith("local_")) await Draft.update(draft.id, { status: "ready" });
      setStatus({ tone: "success", message: "Draft marked ready in Library." });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Draft marked ready locally in Library." });
    }
  }

  function promoteOpportunity(opportunity) {
    const updated = { ...opportunity, status: "promoted_to_draft" };
    setOpportunities((items) => items.map((item) => (sameOpportunity(item, opportunity) ? updated : item)));
    setStatus({ tone: "success", message: "Opportunity promoted. Story Studio is preloaded with the source launch moment." });
    goApp("story-studio");
  }

  async function ignoreOpportunity(opportunity) {
    const updated = { ...opportunity, status: "ignored" };
    setOpportunities((items) => items.map((item) => (sameOpportunity(item, opportunity) ? updated : item)));
    try {
      if (opportunity.id && !String(opportunity.id).startsWith("local_")) await Opportunity.update(opportunity.id, { status: "ignored" });
      setStatus({ tone: "success", message: "Opportunity ignored and hidden from the active list." });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Opportunity ignored locally and hidden from the active list." });
    }
  }

  if (!authChecked && hasLocalAuthToken()) {
    return <AuthLoadingScreen />;
  }

  if (isPublic) {
    return (
      <PublicSite
        view={renderedView}
        currentUser={currentUser}
        goPublic={goPublic}
        goApp={enterSystem}
        onLogout={logout}
        onSample={startOnboardingWorkflow}
        onAuthProvider={startAuthProviderLogin}
        onEmailAuthenticated={completeAuthenticatedEntry}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--lr-canvas)] text-[var(--lr-text)]">
      <div className="flex min-h-screen">
        <Sidebar view={renderedView} goApp={goApp} goPublic={goPublic} workspace={workspace} currentUser={currentUser} demoMode={demoMode} onLogout={logout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
          <Topbar view={renderedView} goApp={goApp} workspace={workspace} currentUser={currentUser} demoMode={demoMode} onLogout={logout} userMenuOpen={userMenuOpen} setUserMenuOpen={setUserMenuOpen} setSidebarOpen={setSidebarOpen} />
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <StatusNotice status={status} isBusy={isBusy} />
            {renderedView === "overview" && <Overview workspace={workspace} demoMode={demoMode} currentUser={currentUser} activities={activities} clusters={clusters} selectedCluster={selectedCluster} draftRows={draftRows} opportunities={opportunities} onReview={() => goApp("launch-moments")} onImport={() => goApp("sources")} onSources={() => goApp("sources")} onDraft={() => goApp("story-studio")} onLibrary={() => goApp("library")} onHelp={() => goApp("help")} onDetect={detectLaunchMoments} />}
            {renderedView === "sources" && <Sources workspace={workspace} setWorkspace={setWorkspace} onSave={saveWorkspace} sourceTab={sourceTab} setSourceTab={setSourceTab} activityText={activityText} setActivityText={setActivityText} githubRepoInput={githubRepoInput} setGithubRepoInput={setGithubRepoInput} activities={activities} importPhase={importPhase} isBusy={isBusy} onImport={importManualActivity} onGitHubImport={importGitHubActivity} onDetect={detectLaunchMoments} />}
            {renderedView === "launch-moments" && <LaunchMoments clusters={clusters} activities={activities} selectedCluster={selectedCluster} selectedSources={selectedSources} setSelectedCluster={setSelectedCluster} onAccept={acceptCluster} onDetect={detectLaunchMoments} isBusy={isBusy} launchFilter={launchFilter} setLaunchFilter={setLaunchFilter} />}
            {renderedView === "story-studio" && <StoryStudio cluster={acceptedCluster} sourceItems={acceptedSources} draft={draft} setDraft={setDraft} onSaveDraft={saveDraft} onCreateDraft={createDraft} onCreateOpportunities={createOpportunities} isBusy={isBusy} onBack={() => goApp("launch-moments")} onLibrary={() => goApp("library")} />}
            {renderedView === "opportunities" && <Opportunities opportunities={visibleOpportunities} cluster={acceptedCluster} onCreateOpportunities={createOpportunities} onSaveOpportunity={saveOpportunity} onPromote={promoteOpportunity} onIgnore={ignoreOpportunity} isBusy={isBusy} />}
            {renderedView === "library" && <LibraryScreen libraryTab={libraryTab} setLibraryTab={setLibraryTab} draftRows={draftRows} opportunities={opportunities} clusters={clusters} activities={activities} cluster={acceptedCluster} onMarkDraftReady={markDraftReady} librarySearch={librarySearch} setLibrarySearch={setLibrarySearch} />}
            {renderedView === "settings" && <SettingsScreen workspace={workspace} setWorkspace={setWorkspace} onSave={saveWorkspace} isBusy={isBusy} settingsTab={settingsTab} setSettingsTab={setSettingsTab} githubRepoInput={githubRepoInput} activities={activities} importPhase={importPhase} />}
            {renderedView === "help" && <HelpDocsScreen goApp={goApp} />}
          </main>
        </div>
      </div>
    </div>
  );
}


function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--lr-canvas)] px-5 text-[var(--lr-text)]">
      <div className="rounded-[24px] border border-[var(--lr-border)] bg-white p-6 text-center shadow-[var(--lr-shadow)]">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--lr-orange)]" />
        <h1 className="mt-4 text-xl font-semibold">Opening your workspace...</h1>
      </div>
    </div>
  );
}

function PublicSite({ view, currentUser, goPublic, goApp, onLogout, onSample, onAuthProvider, onEmailAuthenticated }) {
  const isAuth = view === "sign-in";
  return (
    <div className="min-h-screen bg-[var(--lr-canvas)] text-[var(--lr-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--lr-border)] bg-white/86 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button onClick={() => goPublic("public-home")} className="flex items-center gap-3 text-left" aria-label="Go to LaunchRelay home">
            <BrandMark />
            <div>
              <div className="font-semibold tracking-tight">LaunchRelay</div>
              <div className="text-xs text-[var(--lr-muted)]">Product education from shipped work</div>
            </div>
          </button>
          <nav className="hidden items-center gap-7 text-sm text-[var(--lr-text-2)] md:flex" aria-label="Public navigation">
            {publicNav.map((item) => <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} className="hover:text-[var(--lr-text)]">{item}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {currentUser ? (
              <>
                <Button variant="ghost" onClick={onLogout} className="rounded-xl text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Sign out</Button>
                <Button onClick={() => goApp("overview")} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Enter system</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => goPublic("sign-in")} className="rounded-xl text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Sign in</Button>
                <Button onClick={() => goPublic("sign-in")} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Start free</Button>
              </>
            )}
          </div>
        </div>
      </header>
      {isAuth ? <SignIn currentUser={currentUser} goPublic={goPublic} goApp={goApp} onAuthProvider={onAuthProvider} onEmailAuthenticated={onEmailAuthenticated} /> : <MarketingHome currentUser={currentUser} onSample={onSample} goPublic={goPublic} goApp={goApp} />}
    </div>
  );
}

function MarketingHome({ currentUser, onSample, goPublic, goApp }) {
  return (
    <main>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:py-24">
        <div className="flex flex-col justify-center">
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-6xl">
            Your product already contains its next great story.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--lr-text-2)]">
            LaunchRelay finds launch-worthy moments in shipped work, connects them to real source activity, and helps product education teams turn them into trusted content.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => currentUser ? goApp("overview") : goPublic("sign-in")} className="h-12 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">{currentUser ? "Enter the system" : "Start with your repository"} <ArrowRight className="ml-2 h-4 w-4" /></Button>
            <Button onClick={onSample} variant="ghost" className="h-12 rounded-xl border border-[var(--lr-border)] bg-white px-5 text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Explore a sample workspace</Button>
          </div>
        </div>
        <SourceToStoryPreview />
      </section>
      <section id="product" className="border-y border-[var(--lr-border)] bg-white">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-3">
          <PillarCard title="Launch Detection" body="Find launch moments worth explaining from PRs, commits, releases, and notes." icon={CircleDot} />
          <PillarCard title="Story Coproduction" body="Let humans curate the moment, then shape it into an editable, source-grounded draft." icon={PenLine} />
          <PillarCard title="Opportunity Expansion" body="Turn one shipped moment into docs, tutorials, FAQs, posts, and enablement angles." icon={Lightbulb} />
        </div>
      </section>
      <section id="how-it-works" className="mx-auto grid max-w-7xl gap-4 px-5 py-12 md:grid-cols-3">
        <PillarCard title="1. Normalize source activity" body="GitHub activity and product notes become structured source receipts." icon={GitBranch} />
        <PillarCard title="2. Review launch moments" body="LaunchRelay explains why a change cluster matters and asks for human approval." icon={ShieldCheck} />
        <PillarCard title="3. Create trusted education" body="Accepted moments become editable drafts and follow-up opportunities." icon={FileText} />
      </section>
      <section id="use-cases" className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-12 md:grid-cols-3">
          <PillarCard title="Devrel" body="Turn shipped improvements into tutorials, docs updates, and launch posts." icon={BookOpen} />
          <PillarCard title="Product marketing" body="Find credible story angles without inventing unsupported claims." icon={Sparkles} />
          <PillarCard title="Founder-led teams" body="Keep product education flowing from the work already happening." icon={Layers3} />
        </div>
      </section>
    </main>
  );
}

function SignIn({ currentUser, goPublic, goApp, onAuthProvider, onEmailAuthenticated }) {
  const [emailMode, setEmailMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailBusy, setEmailBusy] = useState(false);

  async function submitEmailAuth(event) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailStatus(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password.trim()) throw new Error("Enter an email and password.");

      if (emailMode === "signup") {
        await base44.auth.register({ email: normalizedEmail, password });
        setEmailMode("verify");
        setEmailStatus({ tone: "success", message: "Check your email for the verification code." });
        return;
      }

      if (emailMode === "verify") {
        if (!otpCode.trim()) throw new Error("Enter the verification code from your email.");
        const response = await base44.auth.verifyOtp({ email: normalizedEmail, otpCode: otpCode.trim() });
        if (response?.access_token) base44.auth.setToken(response.access_token);
        const user = response?.user || await base44.auth.me();
        await onEmailAuthenticated(user);
        return;
      }

      const response = await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      await onEmailAuthenticated(response.user);
    } catch (error) {
      console.error(error);
      setEmailStatus({ tone: "error", message: readableAuthError(error) });
    } finally {
      setEmailBusy(false);
    }
  }

  if (currentUser) {
    return (
      <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-4xl items-center px-5 py-12">
        <section className="lr-work-surface p-8 text-center">
          <Badge tone="green">Signed in</Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.035em]">Welcome back to LaunchRelay.</h1>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-[var(--lr-text-2)]">Your account session is active. Continue into the product workspace.</p>
          <Button onClick={() => goApp("overview")} className="mt-6 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Enter the system</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[0.92fr_1.08fr]">
      <div>
        <Badge tone="orange">Real workspace sign in</Badge>
        <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Sign in and keep your source trail saved.</h1>
        <p className="mt-4 max-w-xl leading-7 text-[var(--lr-text-2)]">LaunchRelay is a normal product workspace: sign in, import shipped work, and return later to the same saved activity, launch moments, drafts, and opportunities.</p>
        <div className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
          <SignInProof label="Persistent" value="Saved per account" />
          <SignInProof label="Grounded" value="Source trail first" />
          <SignInProof label="Private" value="No sample state" />
        </div>
      </div>
      <section className="lr-work-surface p-6 md:p-7">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">Sign in to LaunchRelay</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">Use Google, GitHub, or email to open your real workspace.</p>
        <div className="mt-6 grid gap-3">
          <AuthButton icon={GoogleLogo} label="Continue with Google" onClick={() => onAuthProvider("google")} />
          <AuthButton icon={GitBranch} label="Continue with GitHub" onClick={() => onAuthProvider("github")} />
        </div>
        <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.08em] text-[var(--lr-muted)]"><span className="h-px flex-1 bg-[var(--lr-border)]" />Email<span className="h-px flex-1 bg-[var(--lr-border)]" /></div>
        <form onSubmit={submitEmailAuth} className="space-y-3">
          <Field label="Email" value={email} onChange={setEmail} />
          <label htmlFor="sign-in-password" className="block"><span className="mb-2 block text-sm font-medium text-[var(--lr-text)]">Password</span><Input id="sign-in-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-xl border-[var(--lr-border)] bg-white text-[var(--lr-text)] shadow-sm" /></label>
          {emailMode === "verify" && <Field label="Verification code" value={otpCode} onChange={setOtpCode} help="Enter the code Base44 sent to your email." />}
          {emailStatus && <div className={`rounded-xl border px-3 py-2 text-sm ${emailStatus.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{emailStatus.message}</div>}
          <Button type="submit" disabled={emailBusy} className="h-11 w-full rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e] disabled:opacity-70">{emailBusy ? "Working..." : emailMode === "signup" ? "Create account" : emailMode === "verify" ? "Verify and open workspace" : "Sign in with email"}</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" onClick={() => { setEmailMode(emailMode === "signup" ? "login" : "signup"); setEmailStatus(null); }} className="font-medium text-[var(--lr-blue)] underline-offset-4 hover:underline">{emailMode === "signup" ? "Already have an account? Sign in" : "Create an email account"}</button>
          {emailMode === "verify" && <button type="button" onClick={() => setEmailMode("login")} className="text-[var(--lr-text-2)] underline-offset-4 hover:text-[var(--lr-text)] hover:underline">Back to sign in</button>}
          <button type="button" onClick={() => goPublic("public-home")} className="text-[var(--lr-text-2)] underline-offset-4 hover:text-[var(--lr-text)] hover:underline">Back to website</button>
        </div>
      </section>
    </main>
  );
}

function Sidebar({ view, goApp, goPublic, workspace, currentUser, demoMode, onLogout, sidebarOpen, setSidebarOpen }) {
  return (
    <>
      <div className={`fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm lg:hidden ${sidebarOpen ? "block" : "hidden"}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--lr-border)] bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-[var(--lr-border)] px-5 py-4">
          <button onClick={() => goPublic("public-home")} className="flex items-center gap-3 text-left" aria-label="Open public home">
            <BrandMark />
            <div>
              <div className="font-semibold">LaunchRelay</div>
              <div className="text-xs text-[var(--lr-muted)]">Workspace</div>
            </div>
          </button>
          <button className="rounded-lg p-2 text-[var(--lr-muted)] hover:bg-[var(--lr-surface-2)] lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-3">
          <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] px-3 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--lr-muted)]">Active workspace</div>
            <div className="mt-1 truncate text-sm font-semibold">{workspace.name}</div>
            <div className="mt-2 text-xs leading-5 text-[var(--lr-text-2)]">{currentUser ? "Saved to your account" : demoMode ? "Sample walkthrough" : "Local workspace"}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="App navigation">
          {appNav.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button key={id} onClick={() => goApp(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)] hover:text-[var(--lr-text)]"}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-[var(--lr-border)] p-3">
          <button onClick={() => goApp("settings")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${view === "settings" ? "bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]"}`}><Settings className="h-4 w-4" />Workspace settings</button>
          <button onClick={() => goApp("help")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${view === "help" ? "bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]"}`}><HelpCircle className="h-4 w-4" />Help & docs</button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ view, goApp, workspace, currentUser, demoMode, onLogout, userMenuOpen, setUserMenuOpen, setSidebarOpen }) {
  const current = viewLabel(view);
  const userName = currentUser ? displayUserName(currentUser) : "LaunchRelay";
  const initials = avatarInitials(userName, currentUser?.email);
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--lr-border)] bg-[var(--lr-canvas)]/92 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button className="rounded-xl border border-[var(--lr-border)] bg-white p-2 text-[var(--lr-text-2)] lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-[var(--lr-muted)]">
            <span>LaunchRelay / {current}</span>
          </div>
        </div>
        <Button onClick={() => goApp("sources")} className="hidden rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e] sm:inline-flex"><Plus className="mr-2 h-4 w-4" />Import activity</Button>
        {currentUser ? (
          <div className="relative hidden lg:block">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 rounded-xl border border-[var(--lr-border)] bg-white px-2.5 py-2 text-sm text-[var(--lr-text-2)] shadow-sm hover:bg-[var(--lr-surface-2)]" aria-expanded={userMenuOpen} aria-label="Open account menu">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--lr-text)] text-xs font-semibold text-white">{initials}</span>
              <span className="max-w-[150px] truncate">{userName}</span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-[var(--lr-border)] bg-white p-3 shadow-[var(--lr-shadow)] lr-soft-enter">
                <div className="flex items-center gap-3 rounded-xl bg-[var(--lr-canvas)] p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--lr-text)] text-sm font-semibold text-white">{initials}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--lr-text)]">{userName}</div>
                    <div className="truncate text-xs text-[var(--lr-muted)]">{currentUser.email || "Account user"}</div>
                    <div className="mt-1 truncate text-xs text-[var(--lr-text-2)]">{workspace.name}</div>
                  </div>
                </div>
                <button onClick={() => goApp("settings")} className="mt-2 flex w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Workspace settings</button>
                <button onClick={() => goApp("help")} className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Help & docs</button>
                <button onClick={onLogout} className="flex w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Sign out</button>
              </div>
            )}
          </div>
        ) : demoMode ? (
          <Badge tone="blue">Sample</Badge>
        ) : null}
      </div>
    </header>
  );
}

function ExpertOnboardingPanel({ nextAction, onHelp }) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-[var(--lr-border)] bg-white shadow-[var(--lr-shadow)]">
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
        <div>
          <Badge tone="orange">Expert onboarding</Badge>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[var(--lr-text)]">Start with shipped work, not a blank prompt.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--lr-text-2)]">
            LaunchRelay works like a product education operator: define the product truth, import source activity, review launch-worthy moments, then turn approved moments into drafts and opportunities.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={nextAction.onAction} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{nextAction.label}</Button>
            <Button onClick={onHelp} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Open workflow guide</Button>
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--lr-canvas)] p-4">
          <div className="text-sm font-semibold text-[var(--lr-text)]">How to read the workspace</div>
          <MiniTimeline items={["Sources: product context and source receipts", "Launch Moments: candidates requiring human review", "Story Studio: draft only after evidence is accepted", "Library: durable archive with source trail preserved"]} />
        </div>
      </div>
    </section>
  );
}

function SampleWorkspacePanel({ onImport, onHelp }) {
  return (
    <section className="rounded-[22px] border border-[var(--lr-border)] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge tone="blue">Sample workspace</Badge>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em]">You are viewing the guided example.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--lr-text-2)]">Use this to understand the full flow, then import your own repository or notes to start a real source trail.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onImport} className="min-w-[170px] whitespace-nowrap rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Import your source activity</Button>
          <Button onClick={onHelp} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">See guide</Button>
        </div>
      </div>
    </section>
  );
}

function NextActionPanel({ nextAction }) {
  return (
    <SectionCard title="Next best action" description="A deterministic recommendation based on the current workspace state.">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.015em] text-[var(--lr-text)]">{nextAction.title}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--lr-text-2)]">{nextAction.body}</p>
        </div>
        <Button onClick={nextAction.onAction} disabled={nextAction.disabled} className="min-w-[170px] whitespace-nowrap rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{nextAction.label}</Button>
      </div>
    </SectionCard>
  );
}

function WorkflowProgress({ steps }) {
  return (
    <SectionCard title="Workflow progress" description="Each step unlocks the next part of the source-grounded story workflow.">
      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.label} className={`rounded-2xl border p-4 ${step.state === "Done" ? "border-emerald-200 bg-[#EAF8F1]" : step.state === "Current" ? "border-[var(--lr-orange)] bg-[var(--lr-orange-tint)]" : "border-[var(--lr-border)] bg-[var(--lr-canvas)]"}`}>
            <div className="text-xs font-medium text-[var(--lr-muted)]">Step {index + 1}</div>
            <div className="mt-2 font-semibold text-[var(--lr-text)]">{step.label}</div>
            <div className="mt-2 text-xs font-medium text-[var(--lr-text-2)]">{step.state}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function MicroHelp({ title, items }) {
  return (
    <SectionCard title={title} description="Quick reminder without a tour or chatbot." compact>
      <ul className="space-y-2 text-sm leading-6 text-[var(--lr-text-2)]">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--lr-orange)]" />{item}</li>)}
      </ul>
    </SectionCard>
  );
}

function StatusNotice({ status, isBusy }) {
  if (!status) return null;
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${statusClasses(status.tone)}`} role="status" aria-live="polite">
      {isBusy ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin" /> : <StatusIcon tone={status.tone} />}
      <span>{status.message}</span>
    </div>
  );
}

function Overview({ workspace, demoMode, currentUser, activities, clusters, selectedCluster, draftRows, opportunities, onReview, onImport, onSources, onDraft, onLibrary, onHelp, onDetect }) {
  const momentsNeedingReview = clusters.filter((cluster) => cluster.status !== "accepted" && cluster.status !== "edited");
  const acceptedMoment = clusters.find((cluster) => cluster.status === "accepted" || cluster.status === "edited") || null;
  const workflow = buildWorkflowProgress({ workspace, activities, clusters, acceptedMoment, draftRows });
  const nextAction = buildNextAction({ activities, clusters, acceptedMoment, draftRows, onSources, onImport, onDetect, onReview, onDraft, onLibrary });
  const showExpertOnboarding = !demoMode && currentUser && (!activities.length || !clusters.length || !draftRows.length);
  return (
    <Page title="Overview" eyebrow="Workspace command center" description="See the current workflow state and the next recommended action.">
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {showExpertOnboarding && <ExpertOnboardingPanel nextAction={nextAction} onHelp={onHelp} onSample={onImport} />}
          {demoMode && <SampleWorkspacePanel onImport={onImport} onHelp={onHelp} />}
          <NextActionPanel nextAction={nextAction} />
          <WorkflowProgress steps={workflow} />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Source activities" value={activities.length} help="PRs, commits, releases, and notes" />
            <MetricCard label="Detected moments" value={clusters.length} help="Source-backed candidates" />
            <MetricCard label="Drafts + opportunities" value={draftRows.length + opportunities.length} help="Saved or in progress" />
          </div>
          <SectionCard title="Moments needing review" description="Human approval stays central before anything becomes a draft.">
            {clusters.length ? (
              <div className="space-y-3">
                {clusters.map((cluster) => <MomentQueueRow key={cluster.id || cluster.title} cluster={cluster} active={selectedCluster?.id === cluster.id} onClick={onReview} />)}
              </div>
            ) : (
              <EmptyState icon={CircleDot} eyebrow="Launch detection queue" title="No launch moments yet" body="Launch moments are created only after source activity exists. Import a repo or paste shipped-work notes, then run detection to see candidates with evidence." actionLabel="Import activity" onAction={onImport} secondaryLabel={activities.length ? "Detect now" : null} onSecondary={onDetect} />
            )}
          </SectionCard>
          <SectionCard title="Recent drafts" description="Durable product education assets stay linked back to their source moment.">
            <DataTable columns={["Title", "Type", "Linked moment", "Status", "Updated"]} rows={draftRows.map((item) => [item.title, item.draft_type || "Launch story", selectedCluster?.title || "Accepted moment", item.status || "draft", nowLabel])} empty="No drafts yet. Accept a launch moment, then create a source-grounded draft in Story Studio." />
          </SectionCard>
        </div>
        <aside className="space-y-5">
          <SectionCard title="Source health" description="Concrete source state for this workspace." compact>
            <StatusRow label="Workspace mode" value={demoMode ? "Sample workspace" : currentUser ? "Signed-in workspace" : "Local workspace"} />
            <StatusRow label="Source records" value={`${activities.length} imported`} />
            <StatusRow label="Source mode" value={activities.length ? sourceModeLabel(activities) : "No source records yet"} />
            <StatusRow label="Next action" value={nextAction.label} />
          </SectionCard>
          <SectionCard title="Product context" description="Active positioning inputs." compact>
            <StatusRow label="Product" value={workspace.name} />
            <StatusRow label="Audience" value={workspace.target_audience} />
            <StatusRow label="Channels" value={workspace.primary_channels} />
          </SectionCard>
          <MicroHelp title="What does the workflow mean?" items={["Sources are product context plus shipped-work evidence.", "Launch Moments are candidates that still need human review.", "Story Studio only drafts from an accepted moment.", "Library is the durable archive of reviewed work."]} />
          <SectionCard title="Recent activity" description="Latest workflow signals.">
            <MiniTimeline items={[activities.length ? `${activities.length} source receipts imported` : "Waiting for source import", clusters.length ? `${clusters.length} launch moments detected` : "Detection not run yet", draftRows.length ? "Draft created" : "No draft yet"]} />
          </SectionCard>
        </aside>
      </div>
    </Page>
  );
}

function Sources({ workspace, setWorkspace, onSave, sourceTab, setSourceTab, activityText, setActivityText, githubRepoInput, setGithubRepoInput, activities, importPhase, isBusy, onImport, onGitHubImport, onDetect }) {
  const tabs = [
    ["context", "Product context"],
    ["connections", "Connections"],
    ["notes", "Notes"],
  ];
  return (
    <Page title="Sources" eyebrow="Source trail" description="Add product context and source activity before detecting launch moments." action={<Button onClick={activities.length ? onDetect : onGitHubImport} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{activities.length ? "Detect new moments" : "Import GitHub activity"}</Button>}>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Sources sections">
        {tabs.map(([id, label]) => <TabButton key={id} active={sourceTab === id} onClick={() => setSourceTab(id)}>{label}</TabButton>)}
      </div>
      {sourceTab === "context" && <ProductContextForm workspace={workspace} setWorkspace={setWorkspace} onSave={onSave} isBusy={isBusy} />}
      {sourceTab === "connections" && <ConnectionsPanel githubRepoInput={githubRepoInput} setGithubRepoInput={setGithubRepoInput} activities={activities} importPhase={importPhase} isBusy={isBusy} onGitHubImport={onGitHubImport} onDetect={onDetect} />}
      {sourceTab === "notes" && <ManualNotesPanel activityText={activityText} setActivityText={setActivityText} activities={activities} isBusy={isBusy} onImport={onImport} />}
      <SectionCard title="Structured activity records" description="Every imported item becomes source material for launch detection.">
        <ActivityList activities={activities} />
      </SectionCard>
    </Page>
  );
}

function LaunchMoments({ clusters, activities, selectedCluster, selectedSources, setSelectedCluster, onAccept, onDetect, isBusy, launchFilter, setLaunchFilter }) {
  const filters = [
    ["all", "All"],
    ["needs-review", "Needs review"],
    ["accepted", "Accepted"],
    ["high-confidence", "High confidence"],
  ];
  const filteredClusters = clusters.filter((cluster) => {
    if (launchFilter === "needs-review") return cluster.status !== "accepted" && cluster.status !== "edited";
    if (launchFilter === "accepted") return cluster.status === "accepted" || cluster.status === "edited";
    if (launchFilter === "high-confidence") return /high/i.test(cluster.confidence_label || "") || Number(cluster.confidence_score || 0) >= 0.8;
    return true;
  });
  return (
    <Page title="Launch Moments" eyebrow="Launch Detection" description="Review source-backed story candidates and accept the ones worth drafting." action={<Button onClick={onDetect} disabled={isBusy || !activities.length} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Detect new moments</Button>}>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Launch moment filters">
        {filters.map(([id, label]) => <TabButton key={id} active={launchFilter === id} onClick={() => setLaunchFilter(id)}>{label}</TabButton>)}
      </div>
      {clusters.length === 0 ? (
        <EmptyState icon={CircleDot} eyebrow="Launch detection" title="No launch moments detected yet" body="This screen stays empty until source activity exists. Import GitHub activity or paste shipped-work notes, then run detection to create source-backed candidates for human review." actionLabel="Detect moments" onAction={onDetect} disabled={!activities.length || isBusy} />
      ) : filteredClusters.length === 0 ? (
        <EmptyState icon={CircleDot} title="No moments match this filter" body="Switch filters or run detection again after importing more source activity." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <SectionCard title="Source timeline" description={`${activities.length} receipts available`} compact>
            <div className="max-h-[680px] space-y-3 overflow-auto pr-1">
              {activities.map((item) => <SourceReceipt key={item.id || item.title} item={item} compact />)}
            </div>
          </SectionCard>
          <SectionCard title="Detected candidates" description="Prioritized by source count, confidence, and product value." compact>
            <div className="space-y-3">
              {filteredClusters.map((cluster) => <MomentCandidate key={cluster.id || cluster.title} cluster={cluster} active={selectedCluster?.id === cluster.id} onClick={() => setSelectedCluster(cluster)} />)}
            </div>
          </SectionCard>
          <EvidencePanel cluster={selectedCluster} sources={selectedSources} onAccept={onAccept} />
        </div>
      )}
    </Page>
  );
}

function StoryStudio({ cluster, sourceItems, draft, setDraft, onSaveDraft, onCreateDraft, onCreateOpportunities, isBusy, onBack, onLibrary }) {
  if (!cluster) {
    return <Page title="Story Studio" eyebrow="Story Coproduction" description="Edit a draft created from an accepted source moment."><EmptyState icon={PenLine} eyebrow="Human review required" title="No accepted launch moment" body="Story Studio only opens meaningful drafting after a person accepts a source-backed launch moment. This keeps drafts grounded in evidence instead of starting from a blank prompt." actionLabel="Review launch moments" onAction={onBack} /></Page>;
  }
  return (
    <Page title="Story Studio" eyebrow="Story Coproduction" description="Edit a draft created from the accepted source moment." action={<Button onClick={onCreateDraft} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{draft ? "Regenerate draft" : "Generate draft"}</Button>}>
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <SectionCard title="Story foundation" description="The source-backed brief for this draft." compact>
          <FoundationList cluster={cluster} sourceItems={sourceItems} />
        </SectionCard>
        <SectionCard title="Editor" description="Editable draft workspace with source-grounded sections." compact>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--lr-text-2)]">
            <span className="font-medium capitalize text-[var(--lr-text)]">{draft?.status || "draft"}</span>
            <span>{wordCount(draft?.body)} words</span>
          </div>
          {draft ? (
            <div className="space-y-3">
              <Input aria-label="Draft title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="h-12 rounded-xl border-[var(--lr-border)] bg-white text-lg font-semibold text-[var(--lr-text)]" />
              <textarea aria-label="Draft body" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className="min-h-[520px] w-full rounded-2xl border border-[var(--lr-border)] bg-white p-5 text-sm leading-7 text-[var(--lr-text)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--lr-orange)]" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={onSaveDraft} className="rounded-xl bg-[var(--lr-text)] text-white shadow-none hover:bg-black">Save draft</Button>
                <span className="inline-flex items-center rounded-xl border border-[var(--lr-border)] bg-[var(--lr-surface-2)] px-3 py-2 text-sm text-[var(--lr-text-2)]">Mark ready from Library</span>
              </div>
            </div>
          ) : (
            <EmptyState icon={FileText} eyebrow="Draft from accepted evidence" title="No draft yet" body="Generate a first draft from this accepted launch moment. The draft will include guardrail metadata and source references so you can review it like product education, not generic AI copy." actionLabel="Generate source-grounded draft" onAction={onCreateDraft} disabled={isBusy} secondaryLabel="Review Library after saving" onSecondary={onLibrary} />
          )}
        </SectionCard>
        <AssistantPanel cluster={cluster} sourceItems={sourceItems} onCreateOpportunities={onCreateOpportunities} isBusy={isBusy} />
      </div>
    </Page>
  );
}

function Opportunities({ opportunities, cluster, onCreateOpportunities, onSaveOpportunity, onPromote, onIgnore, isBusy }) {
  return (
    <Page title="Opportunities" eyebrow="Opportunity Expansion" description="Turn an accepted moment into follow-up education assets." action={<Button onClick={onCreateOpportunities} disabled={isBusy || !cluster} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Generate opportunities</Button>}>
      {!cluster ? <EmptyState icon={Lightbulb} eyebrow="Accepted moment required" title="No source moment selected" body="Opportunities come after human review. Accept a launch moment first, then expand that source-backed story into follow-up docs, posts, and enablement angles." /> : opportunities.length === 0 ? <EmptyState icon={Lightbulb} eyebrow="Expansion ready" title="No opportunities generated yet" body="Use the accepted launch moment to create follow-up education angles. Each opportunity stays connected to the reviewed source moment." actionLabel="Generate opportunities" onAction={onCreateOpportunities} disabled={isBusy} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {opportunities.map((item) => <OpportunityCard key={item.id || item.title} item={item} onSave={() => onSaveOpportunity(item)} onPromote={() => onPromote(item)} onIgnore={() => onIgnore(item)} />)}
        </div>
      )}
    </Page>
  );
}

function LibraryScreen({ libraryTab, setLibraryTab, draftRows, opportunities, clusters, activities, cluster, onMarkDraftReady, librarySearch, setLibrarySearch }) {
  const tabs = ["Drafts", "Ready", "Published", "Opportunities", "Moments"];
  const draftTableRows = draftRows.map((item) => [
    item.title,
    item.draft_type || "Launch story",
    cluster?.title || "Accepted moment",
    item.status || "draft",
    nowLabel,
    item.status === "ready" ? <Badge tone="green">Ready</Badge> : <Button onClick={onMarkDraftReady} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Mark ready</Button>,
  ]);
  const readyDraftRows = draftRows.filter((item) => item.status === "ready").map((item) => [item.title, item.draft_type || "Launch story", cluster?.title || "Accepted moment", item.status, nowLabel]);
  const rowsByTab = {
    Drafts: draftTableRows,
    Ready: readyDraftRows,
    Published: [],
    Opportunities: opportunities.map((item) => [item.title, item.format || "Education", cluster?.title || "Launch moment", item.status || "open", nowLabel]),
    Moments: clusters.map((item) => [item.title, "Launch moment", `${item.activity_item_ids?.length || 0} sources`, item.status || "candidate", nowLabel]),
  };
  const columnsByTab = {
    Drafts: ["Title", "Type", "Linked moment", "Status", "Updated", "Action"],
    Ready: ["Title", "Type", "Linked moment", "Status", "Updated"],
    Published: ["Title", "Type", "Linked moment", "Status", "Updated"],
    Opportunities: ["Title", "Type", "Linked moment", "Status", "Updated"],
    Moments: ["Title", "Type", "Sources", "Status", "Updated"],
  };
  const query = librarySearch.trim().toLowerCase();
  const activeRows = (rowsByTab[libraryTab] || []).filter((row) => !query || row.some((cell) => String(cell?.props?.children || cell || "").toLowerCase().includes(query)));
  return (
    <Page title="Library" eyebrow="Durable archive" description="Find saved drafts, ready items, opportunities, and accepted moments.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-2xl border border-[var(--lr-border)] bg-white p-1 shadow-sm">{tabs.map((tab) => <LibraryTabButton key={tab} active={libraryTab === tab} onClick={() => setLibraryTab(tab)}>{tab}</LibraryTabButton>)}</div>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--lr-border)] bg-white px-3 py-2 text-sm text-[var(--lr-muted)]">
          <Search className="h-4 w-4" />
          <input aria-label="Search library" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search library" className="min-w-[160px] bg-transparent text-[var(--lr-text)] outline-none placeholder:text-[var(--lr-muted)]" />
        </label>
      </div>
      <SectionCard title={`${libraryTab} view`} description={librarySummary({ activities, cluster, draftRows, opportunities })}>
        <div className="mb-4 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
          <strong className="text-[var(--lr-text)]">Source trail preserved:</strong> Library items are meant to stay connected to the source receipts and accepted launch moments that produced them.
        </div>
        <DataTable columns={columnsByTab[libraryTab] || columnsByTab.Drafts} rows={activeRows} empty={query ? `No ${libraryTab.toLowerCase()} match “${librarySearch}”.` : libraryEmptyText(libraryTab)} />
      </SectionCard>
    </Page>
  );
}

function HelpDocsScreen({ goApp }) {
  const guideRows = [
    ["Sources", "Add product context and source activity before detection."],
    ["Launch Moments", "Review source-backed story candidates and accept the ones worth drafting."],
    ["Story Studio", "Edit a draft created from an accepted source moment."],
    ["Opportunities", "Turn an accepted moment into follow-up education assets."],
    ["Library", "Find saved drafts, ready items, opportunities, and accepted moments."],
  ];
  return (
    <Page title="Help & docs" eyebrow="Workspace guide" description="A concise guide for what to do, where to go, and what each LaunchRelay area means.">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <SectionCard title="What LaunchRelay does" description="LaunchRelay turns shipped work into source-grounded product education.">
            <div className="grid gap-3 md:grid-cols-3">
              <PillarCard title="1. Import source activity" body="Bring in GitHub work or paste shipped-work notes as explicit source receipts." icon={GitBranch} />
              <PillarCard title="2. Review launch moments" body="Detect candidate product stories and keep the human approval gate central." icon={ShieldCheck} />
              <PillarCard title="3. Shape drafts and opportunities" body="Create editable drafts and follow-up ideas while preserving source links." icon={FileText} />
            </div>
          </SectionCard>
          <SectionCard title="Workflow in 5 steps" description="Use this when you forget what to do next.">
            <DataTable columns={["Area", "What it is for"]} rows={guideRows} empty="Guide unavailable." />
          </SectionCard>
          <SectionCard title="Sample workspace vs real workspace" description="Both are useful, but they mean different things.">
            <div className="grid gap-3 md:grid-cols-2">
              <PillarCard title="Sample workspace" body="A guided example for judging, walkthroughs, and learning the product flow. Changes are local/sample." icon={BookOpen} />
              <PillarCard title="Real workspace" body="Your signed-in source trail, workspace context, launch moments, drafts, and opportunities." icon={UserCircle} />
            </div>
          </SectionCard>
          <SectionCard title="Current build reality" description="Honest product state for this Base44 version.">
            <MiniTimeline items={[
              "Base44 entities store workspaces, source activity, launch moments, drafts, and opportunities.",
              "Backend functions normalize activity, import public GitHub activity, detect launch moments, and expand opportunities.",
              "Drafting and opportunity generation use deterministic code and content guardrails by default.",
              "Future AI can be connected as an optional, source-grounded assistant path.",
            ]} />
          </SectionCard>
          <SectionCard title="Troubleshooting" description="Safe fallback paths instead of dead ends.">
            <MiniTimeline items={[
              "GitHub import fails: paste shipped-work notes in Sources → Notes and continue the same workflow.",
              "No launch moments: import more concrete shipped-work evidence, then run detection again.",
              "Story Studio is empty: accept a Launch Moment first so the draft has source grounding.",
              "Library is empty: create or save a draft/opportunity before expecting durable records.",
            ]} />
          </SectionCard>
        </div>
        <SectionCard title="Quick actions" description="Jump into the main walkthrough." compact>
          <div className="grid gap-2">
            <Button onClick={() => goApp("sources")} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Import or paste activity</Button>
            <Button onClick={() => goApp("launch-moments")} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Review launch moments</Button>
            <Button onClick={() => goApp("story-studio")} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Open Story Studio</Button>
            <Button onClick={() => goApp("library")} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Open Library</Button>
          </div>
          <div className="mt-5 rounded-2xl bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
            LaunchRelay is deterministic by default in this build. It should never ask you to trust unsupported AI output without source receipts.
          </div>
        </SectionCard>
      </div>
    </Page>
  );
}

function SettingsScreen({ workspace, setWorkspace, onSave, isBusy, settingsTab, setSettingsTab, githubRepoInput, activities, importPhase }) {
  const tabs = [
    ["general", "General"],
    ["model", "AI model"],
    ["connections", "Connections"],
    ["billing", "Account & billing"],
  ];
  return (
    <Page title="Workspace settings" eyebrow="Settings" description="Manage product context, source connections, model options, and account readiness." action={<Button onClick={onSave} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Save settings</Button>}>
      <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
        <SectionCard title="Settings" description="Workspace areas" compact>
          {tabs.map(([id, label]) => <button key={id} onClick={() => setSettingsTab(id)} className={`mb-1 flex w-full rounded-xl px-3 py-2 text-left text-sm ${settingsTab === id ? 'bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]' : 'text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]'}`}>{label}</button>)}
        </SectionCard>
        {settingsTab === "general" && <ProductContextForm workspace={workspace} setWorkspace={setWorkspace} onSave={onSave} isBusy={isBusy} settingsMode />}
        {settingsTab === "model" && <ModelSettingsPanel />}
        {settingsTab === "connections" && <SettingsConnectionsPanel githubRepoInput={githubRepoInput} activities={activities} importPhase={importPhase} />}
        {settingsTab === "billing" && <AccountBillingPanel />}
      </div>
    </Page>
  );
}

function ModelSettingsPanel() {
  return (
    <SectionCard title="AI model connection" description="Prepare optional AI assistance without turning the core workflow into a black-box writer.">
      <div className="mb-4 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm text-[var(--lr-text-2)]">
        Coming soon: connect a Base44-supported model or bring another approved provider. Current drafts still use deterministic templates and source checks.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <StatusRow label="Current mode" value="Deterministic generation" />
        <StatusRow label="Preferred path" value="Base44 AI connection" />
        <StatusRow label="Human gate" value="Required before publishing" />
        <StatusRow label="Source grounding" value="Always required" />
      </div>
    </SectionCard>
  );
}

function SettingsConnectionsPanel({ githubRepoInput, activities, importPhase }) {
  return (
    <SectionCard title="Connections" description="Source connections feed the product education workflow.">
      <div className="grid gap-4 md:grid-cols-2">
        <StatusRow label="Primary repository" value={githubRepoInput || "Not set"} />
        <StatusRow label="Imported records" value={`${activities.length} source activities`} />
        <StatusRow label="Import path" value="Base44 function with browser fallback" />
        <StatusRow label="Current phase" value={importPhase || "idle"} />
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--lr-text-2)]">
        Connections are where LaunchRelay remembers which product sources can become source receipts. For this build, GitHub repository import and manual shipped-work notes are the active paths.
      </p>
    </SectionCard>
  );
}

function AccountBillingPanel() {
  return (
    <SectionCard title="Account & billing" description="Account controls are prepared for a real workspace path, with paid controls kept inactive until needed.">
      <Badge tone="blue">Coming soon</Badge>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatusRow label="Workspace plan" value="Contest workspace" />
        <StatusRow label="Billing status" value="Not connected" />
        <StatusRow label="Credits policy" value="Credit-safe deterministic core" />
        <StatusRow label="Upgrade path" value="Add after auth + billing are verified" />
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--lr-text-2)]">
        This keeps account expectations visible without requesting payment details or enabling paid AI features during the submission flow.
      </p>
    </SectionCard>
  );
}

function ProductContextForm({ workspace, setWorkspace, onSave, isBusy, settingsMode = false }) {
  const fields = [
    ["name", "Product name", "The product LaunchRelay should understand and explain."],
    ["description", "Product description", "One clear sentence about what the product helps users do."],
    ["target_audience", "Audience", "Who the launch story should be useful for."],
    ["product_stage", "Stage", "MVP, beta, mature product, or another operating stage."],
    ["primary_repo_url", "Primary repository", "Public repo or owner/repo used for source activity import."],
    ["primary_channels", "Channels", "Where the final education work will usually appear."],
  ];
  return (
    <SectionCard title={settingsMode ? "General workspace details" : "Product context"} description="These inputs shape what LaunchRelay considers launch-worthy, how it explains value, and which terminology it should preserve.">
      <div className="mb-5 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
        Start with the product truth. LaunchRelay works best when source activity is connected to a clear audience, positioning, channels, and writing style.
      </div>
      <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label, help]) => <Field key={key} label={label} help={help} value={workspace[key]} onChange={(value) => setWorkspace({ ...workspace, [key]: value })} />)}</div>
      <TextArea label="Positioning" help="The strategic angle LaunchRelay should protect when turning shipped work into education." value={workspace.positioning_notes} onChange={(value) => setWorkspace({ ...workspace, positioning_notes: value })} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextArea label="Terminology" help="Words and concepts the product should consistently use or avoid." value={workspace.terminology_notes} onChange={(value) => setWorkspace({ ...workspace, terminology_notes: value })} />
        <TextArea label="Style guidance" help="Tone rules for drafts, such as practical, non-hypey, beginner-friendly, or technical." value={workspace.style_guidance} onChange={(value) => setWorkspace({ ...workspace, style_guidance: value })} />
      </div>
      <Button onClick={onSave} disabled={isBusy} className="mt-5 rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Save product context</Button>
    </SectionCard>
  );
}

function ConnectionsPanel({ githubRepoInput, setGithubRepoInput, activities, importPhase, isBusy, onGitHubImport, onDetect }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <SectionCard title="GitHub connection" description="Best for public repositories and real shipped work.">
        <div className="mb-4 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
          Choose GitHub when the source of truth is code activity. Use Notes when you need a fast test path, private work, release notes, or customer context.
        </div>
        <Field label="Repository URL or owner/repo" help="Paste a public GitHub URL or owner/repo. Private repo OAuth can come later." value={githubRepoInput} onChange={setGithubRepoInput} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onGitHubImport} disabled={isBusy} className="rounded-xl bg-[var(--lr-blue)] text-white shadow-none hover:bg-[#3554d1]">Import activity</Button>
          <Button onClick={onDetect} disabled={isBusy || !activities.length} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Detect launch moments</Button>
        </div>
        <ImportProgress phase={importPhase} />
      </SectionCard>
      <SectionCard title="Connection status" description="Recovery paths are built into the source workflow." compact>
        <StatusRow label="Repo" value={githubRepoInput} />
        <StatusRow label="Last import" value={activities.length ? nowLabel : "Not imported yet"} />
        <StatusRow label="Records" value={`${activities.length} activity items`} />
        <div className="mt-4 rounded-2xl bg-[var(--lr-orange-tint)] p-4 text-sm text-[var(--lr-text-2)]"><strong className="text-[var(--lr-text)]">If import fails:</strong> paste shipped-work notes in the Notes tab and continue the same workflow.</div>
      </SectionCard>
    </div>
  );
}

function ManualNotesPanel({ activityText, setActivityText, activities, isBusy, onImport }) {
  return (
    <SectionCard title="Manual activity paste" description="Best for quick tests, private shipped work, release notes, customer context, or product notes.">
      <TextArea label="Shipped-work notes" value={activityText} onChange={setActivityText} rows={9} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={onImport} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Normalize pasted activity</Button>
        <span className="text-sm text-[var(--lr-text-2)]">{activities.length ? `${activities.length} source records currently available.` : "No records imported yet."}</span>
      </div>
    </SectionCard>
  );
}

function ActivityList({ activities }) {
  if (!activities.length) return <EmptyState icon={GitBranch} title="No activity yet" body="Import a repository or paste shipped-work notes to create source receipts." />;
  return <div className="grid gap-3">{activities.map((item) => <SourceReceipt key={item.id || item.title} item={item} />)}</div>;
}

function SourceReceipt({ item, compact = false }) {
  const sourceLabel = sourceTypeLabel(item.source_type);
  return (
    <article className={`lr-object-card ${compact ? "p-3 pl-5" : "p-4 pl-6"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="blue">{sourceLabel}</Badge>
        {item.product_area && <Badge tone="orange">{item.product_area}</Badge>}
        {item.occurred_at && <span className="text-[var(--lr-muted)]">{formatDate(item.occurred_at)}</span>}
        {item.author && <span className="text-[var(--lr-muted)]">by {item.author}</span>}
      </div>
      <h4 className="font-semibold leading-snug text-[var(--lr-text)]">{item.title}</h4>
      <p className="mt-1 text-sm leading-6 text-[var(--lr-text-2)]">{item.impact_hint || item.body}</p>
      {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--lr-blue)] underline-offset-4 hover:underline">View source <ExternalLink className="h-3 w-3" /></a>}
    </article>
  );
}

function MomentCandidate({ cluster, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${active ? "border-[var(--lr-orange)] bg-[var(--lr-orange-tint)]" : "border-[var(--lr-border)] bg-white hover:border-slate-300"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--lr-text)]">{cluster.title}</h3>
        <Badge tone="green">{cluster.confidence_label || "medium"}</Badge>
      </div>
      <p className="text-sm leading-6 text-[var(--lr-text-2)]">{cluster.user_value || cluster.why_it_matters}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--lr-muted)]">
        <span>{cluster.activity_item_ids?.length || 0} sources</span>
        <span>•</span>
        <span>{cluster.status || "candidate"}</span>
      </div>
    </button>
  );
}

function EvidencePanel({ cluster, sources, onAccept }) {
  if (!cluster) return <SectionCard title="Moment detail" description="Select a candidate to inspect reasoning and evidence." compact><EmptyState icon={CircleDot} title="No selected moment" body="Choose a candidate from the center column." /></SectionCard>;
  return (
    <SectionCard title="Evidence panel" description="Every claim starts from shipped work." compact>
      <Badge tone="orange">Human review required</Badge>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">{cluster.title}</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.summary}</p>
      <div className="mt-4 rounded-2xl bg-[var(--lr-orange-tint)] p-4">
        <div className="text-sm font-semibold text-[var(--lr-text)]">Why LaunchRelay noticed it</div>
        <p className="mt-1 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.detection_reason || cluster.why_it_matters}</p>
      </div>
      <div className="mt-3 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
        <strong className="text-[var(--lr-text)]">Confidence explanation:</strong> based on {sources.length || cluster.activity_item_ids?.length || 0} source receipts, clarity of user value, repeated theme across shipped work, and whether the evidence is direct rather than inferred.
      </div>
      <div className="mt-5 space-y-3">
        <div className="text-sm font-semibold">Evidence list</div>
        {sources.length ? sources.map((item) => <SourceReceipt key={item.id || item.title} item={item} compact />) : <p className="text-sm text-[var(--lr-muted)]">No source records matched this moment yet.</p>}
      </div>
      <div className="mt-5 grid gap-2">
        <Button onClick={() => onAccept(cluster)} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Accept and open Story Studio</Button>
        <div className="rounded-2xl border border-dashed border-[var(--lr-border)] bg-[var(--lr-canvas)] p-3 text-sm text-[var(--lr-text-2)]">
          Refinement tools coming soon: edit, dismiss, merge, and split moments after the core review path is stable.
        </div>
      </div>
    </SectionCard>
  );
}

function AssistantPanel({ cluster, sourceItems, onCreateOpportunities, isBusy }) {
  return (
    <SectionCard title="Review guidance + sources" description="A practical checklist for reviewing product education before it becomes durable." compact>
      <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--lr-green)]" />Grounding checks</div>
        <ul className="mt-3 space-y-2 text-sm text-[var(--lr-text-2)]">
          <li>Human-reviewed moment: {cluster?.status === "accepted" || cluster?.status === "edited" ? "accepted" : "pending"}</li>
          <li>Source references: {sourceItems.length}</li>
          <li>Unsupported claims: remove before publishing</li>
          <li>Inferences: keep only when clearly labeled by source context</li>
        </ul>
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--lr-border)] bg-white p-4">
        <div className="text-sm font-semibold text-[var(--lr-text)]">Expert review checklist</div>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--lr-text-2)]">
          <li>Does the draft match the source evidence?</li>
          <li>Is the user value clear for {cluster?.audience || "the target audience"}?</li>
          <li>Are unsupported claims removed?</li>
          <li>Is the next reader action clear?</li>
        </ul>
      </div>
      <Button onClick={onCreateOpportunities} disabled={isBusy || !cluster} variant="ghost" className="mt-4 w-full rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Expand into opportunities</Button>
    </SectionCard>
  );
}

function OpportunityCard({ item, onSave, onPromote, onIgnore }) {
  return (
    <article className="rounded-2xl border border-[var(--lr-border)] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2"><Badge tone="orange">{item.format || "Education"}</Badge><Badge tone="blue">{item.status || "open"}</Badge></div>
      <h3 className="text-lg font-semibold tracking-[-0.015em]">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">{item.angle || item.why_it_matters}</p>
      <dl className="mt-4 space-y-2 text-sm">
        <InfoLine label="Audience" value={item.audience || "Product education"} />
        <InfoLine label="Why it matters" value={item.why_it_matters} />
        <InfoLine label="Next step" value={item.suggested_next_step || "Promote into a draft brief"} />
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={item.status === "saved"} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{item.status === "saved" ? "Saved" : "Save"}</Button>
        <Button onClick={onPromote} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Promote to draft</Button>
        <Button onClick={onIgnore} variant="ghost" className="rounded-xl text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Ignore</Button>
      </div>
    </article>
  );
}

function SourceToStoryPreview() {
  return (
    <div className="rounded-[28px] border border-[var(--lr-border)] bg-white p-4 shadow-[var(--lr-shadow)]">
      <div className="grid gap-3 md:grid-cols-3">
        <PreviewColumn title="Source activity" items={["PR · onboarding checklist", "Commit · signup redirect", "Note · first-run confusion"]} tone="blue" />
        <PreviewColumn title="Launch moment" items={["Faster onboarding for new teams", "4 source receipts", "Human review required"]} tone="orange" />
        <PreviewColumn title="Trusted story" items={["Editable launch draft", "Inline source trail", "5 follow-up opportunities"]} tone="green" />
      </div>
      <div className="mt-4 rounded-2xl bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
        <strong className="text-[var(--lr-text)]">Preview:</strong> LaunchRelay notices that onboarding work changed signup guidance, groups the source receipts, and turns the accepted moment into product education your team can trust.
      </div>
    </div>
  );
}

function PreviewColumn({ title, items, tone }) {
  return <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4"><Badge tone={tone}>{title}</Badge><div className="mt-4 space-y-2">{items.map((item) => <div key={item} className="rounded-xl bg-white px-3 py-2 text-sm text-[var(--lr-text-2)] shadow-sm">{item}</div>)}</div></div>;
}

function Page({ eyebrow, title, description, action, children }) {
  return (
    <div className="mx-auto max-w-[1500px] lr-soft-enter">
      <div className="mb-6 lr-work-surface overflow-hidden bg-[linear-gradient(135deg,#fff_0%,#fff_58%,var(--lr-orange-tint)_145%)] p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {eyebrow && <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lr-orange)]">{eyebrow}</div>}
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-0.04em] text-[var(--lr-text)] md:text-[2.45rem] md:leading-[1.05]">{title}</h1>
            {description && <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--lr-text-2)] md:text-[15px]">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 gap-2">{action}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SectionCard({ title, description, children, compact = false, level = "supporting" }) {
  const surfaceClass = level === "work" ? "lr-work-surface" : "lr-supporting-panel";
  return <section className={`${surfaceClass} ${compact ? "p-4" : "p-5"}`}><div className="mb-4"><h2 className="text-[17px] font-semibold tracking-[-0.018em] text-[var(--lr-text)]">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--lr-text-2)]">{description}</p>}</div>{children}</section>;
}

function MetricCard({ label, value, help }) {
  return <div className="lr-supporting-panel p-5"><div className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--lr-muted)]">{label}</div><div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--lr-text)]">{value}</div><div className="mt-1 text-xs leading-5 text-[var(--lr-text-2)]">{help}</div></div>;
}

function MomentQueueRow({ cluster, onClick }) {
  return <button onClick={onClick} className="lr-object-card flex w-full flex-col gap-3 p-4 pl-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 md:flex-row md:items-center md:justify-between"><div><h3 className="font-semibold tracking-[-0.01em] text-[var(--lr-text)]">{cluster.title}</h3><p className="mt-1 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.user_value || cluster.why_it_matters}</p></div><div className="flex flex-wrap gap-2 text-xs text-[var(--lr-muted)]"><span>{cluster.activity_item_ids?.length || 0} sources</span><span>•</span><span>{cluster.confidence_label || "medium"}</span><span>•</span><span>Review</span></div></button>;
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-[var(--lr-border)] bg-[var(--lr-canvas)] p-5 text-sm text-[var(--lr-text-2)]">{empty}</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--lr-border)]">
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="bg-[var(--lr-surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--lr-muted)]"><tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-medium">{column}</th>)}</tr></thead>
        <tbody className="divide-y divide-[var(--lr-border)] bg-white">{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-4 py-3 text-[var(--lr-text-2)] first:font-medium first:text-[var(--lr-text)]">{cell}</td>)}</tr>)}</tbody>
      </table>
      <div className="divide-y divide-[var(--lr-border)] md:hidden">{rows.map((row, index) => <div key={`${row[0]}-${index}`} className="bg-white p-4"><div className="font-semibold">{row[0]}</div>{row.slice(1).map((cell, cellIndex) => <div key={`${cell}-${cellIndex}`} className="mt-1 text-sm text-[var(--lr-text-2)]"><span className="text-[var(--lr-muted)]">{columns[cellIndex + 1]}:</span> {cell}</div>)}</div>)}</div>
    </div>
  );
}

function ImportProgress({ phase }) {
  const phases = ["connecting", "fetching", "normalizing", "deduplicating", "complete"];
  return <div className="mt-5 grid gap-2 sm:grid-cols-5">{phases.map((item) => <div key={item} className={`rounded-xl border px-3 py-2 text-xs capitalize ${phase === item || (phase === "complete" && item !== "error") ? "border-[var(--lr-orange)] bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "border-[var(--lr-border)] bg-white text-[var(--lr-muted)]"}`}>{item}</div>)}</div>;
}

function FoundationList({ cluster, sourceItems }) {
  const rows = [
    ["Moment", cluster.title],
    ["Audience", cluster.audience || "Product education teams"],
    ["Problem", cluster.summary],
    ["Product value", cluster.user_value || cluster.why_it_matters],
    ["Sources", `${sourceItems.length} linked receipts`],
    ["Output", "Feature launch story"],
  ];
  return <dl className="space-y-3">{rows.map(([label, value]) => <InfoLine key={label} label={label} value={value} />)}</dl>;
}

function SignInProof({ label, value }) {
  return <div className="lr-supporting-panel p-3"><div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--lr-muted)]">{label}</div><div className="mt-1 text-sm font-medium text-[var(--lr-text)]">{value}</div></div>;
}

function GoogleLogo({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function readableAuthError(error) {
  const raw = error?.response?.data?.message || error?.message || "Authentication failed.";
  if (/network|fetch/i.test(raw)) return "Could not reach Base44 auth. Try again in a moment.";
  if (/invalid|incorrect|unauthorized|not registered/i.test(raw)) return "The email or password did not match an account.";
  if (/otp|code|verify/i.test(raw)) return "The verification code was not accepted. Check the email and try again.";
  return raw;
}

function AuthButton({ icon: Icon, label, onClick, disabled = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--lr-border)] bg-white text-sm font-medium text-[var(--lr-text)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--lr-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"><Icon className="h-4 w-4" />{label}</button>;
}

function PillarCard({ icon: Icon, title, body }) {
  return <article className="rounded-2xl border border-[var(--lr-border)] bg-white p-5"><Icon className="mb-4 h-5 w-5 text-[var(--lr-orange)]" /><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">{body}</p></article>;
}

function EmptyState({ icon: Icon, eyebrow, title, body, actionLabel, onAction, secondaryLabel, onSecondary, disabled }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--lr-border)] bg-[var(--lr-canvas)] p-6 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--lr-orange)] shadow-sm"><Icon className="h-5 w-5" /></div>
      {eyebrow && <div className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-[var(--lr-muted)]">{eyebrow}</div>}
      <h3 className={eyebrow ? "mt-2 font-semibold" : "mt-4 font-semibold"}>{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--lr-text-2)]">{body}</p>
      {(actionLabel || secondaryLabel) && <div className="mt-4 flex flex-wrap justify-center gap-2">{actionLabel && <Button onClick={onAction} disabled={disabled} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{actionLabel}</Button>}{secondaryLabel && <Button onClick={onSecondary} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">{secondaryLabel}</Button>}</div>}
    </div>
  );
}

function Field({ label, value, onChange, help }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <label htmlFor={id} className="block"><span className="mb-2 block text-sm font-medium text-[var(--lr-text)]">{label}</span><Input id={id} value={value || ""} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border-[var(--lr-border)] bg-white text-[var(--lr-text)] shadow-sm" />{help && <span className="mt-1 block text-xs leading-5 text-[var(--lr-muted)]">{help}</span>}</label>;
}

function TextArea({ label, value, onChange, rows = 4, help }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <label htmlFor={id} className="mt-4 block"><span className="mb-2 block text-sm font-medium text-[var(--lr-text)]">{label}</span><textarea id={id} rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[var(--lr-border)] bg-white p-3 text-sm leading-6 text-[var(--lr-text)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--lr-orange)]" />{help && <span className="mt-1 block text-xs leading-5 text-[var(--lr-muted)]">{help}</span>}</label>;
}

function LibraryTabButton({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-[var(--lr-text)] text-white" : "text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)] hover:text-[var(--lr-text)]"}`}>{children}</button>;
}

function librarySummary({ activities, cluster, draftRows, opportunities }) {
  if (!activities.length) return "Import source activity to start building the Library.";
  if (!cluster) return `${activities.length} source records imported. Accept a launch moment to connect drafts and opportunities.`;
  const savedCount = opportunities.filter((item) => item.status === "saved" || item.status === "promoted_to_draft").length;
  return `${activities.length} source records → 1 accepted moment → ${draftRows.length} draft${draftRows.length === 1 ? "" : "s"} → ${savedCount} saved opportunities.`;
}

function libraryEmptyText(tab) {
  const messages = {
    Drafts: "No drafts yet. Accept a launch moment and create a draft in Story Studio to start the durable archive.",
    Ready: "No ready drafts yet. Save a draft, then mark it ready here when it is reviewed.",
    Published: "No published records yet. Publishing controls are intentionally not active until the workflow supports them for real.",
    Opportunities: "No saved opportunities yet. Generate opportunities from an accepted moment, then save the useful ones here.",
    Moments: "No launch moments saved yet. Import activity and run detection to populate reviewed product stories.",
  };
  return messages[tab] || "Nothing saved here yet.";
}

function TabButton({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-xl px-3 py-2 text-sm font-medium ${active ? "bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "border border-[var(--lr-border)] bg-white text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]"}`}>{children}</button>;
}

function Badge({ children, tone = "orange" }) {
  const classes = {
    orange: "border-[rgba(216,93,51,0.22)] bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]",
    blue: "border-[rgba(54,95,232,0.18)] bg-[#EEF2FF] text-[var(--lr-blue)]",
    green: "border-[rgba(31,157,104,0.18)] bg-[#EAF8F1] text-[var(--lr-green)]",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone] || classes.orange}`}>{children}</span>;
}

function StatusIcon({ tone }) {
  if (tone === "loading") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (tone === "error") return <AlertCircle className="h-4 w-4" />;
  if (tone === "warning") return <AlertCircle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function statusClasses(tone) {
  if (tone === "error") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "loading") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function StatusRow({ label, value }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[var(--lr-border)] py-2 last:border-b-0"><span className="text-sm text-[var(--lr-muted)]">{label}</span><span className="text-right text-sm font-medium text-[var(--lr-text)]">{value}</span></div>;
}

function InfoLine({ label, value }) {
  return <div><dt className="text-xs uppercase tracking-[0.08em] text-[var(--lr-muted)]">{label}</dt><dd className="mt-1 text-sm leading-6 text-[var(--lr-text-2)]">{value || "Not set"}</dd></div>;
}

function MiniTimeline({ items }) {
  return <div className="space-y-3">{items.map((item) => <div key={item} className="flex gap-3 text-sm text-[var(--lr-text-2)]"><span className="mt-1 h-2 w-2 rounded-full bg-[var(--lr-orange)]" />{item}</div>)}</div>;
}

function BrandMark() {
  return <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--lr-orange)] text-white shadow-sm"><Layers3 className="h-5 w-5" /></div>;
}

function viewLabel(view) {
  const labels = {
    overview: "Overview",
    sources: "Sources",
    "launch-moments": "Launch Moments",
    "story-studio": "Story Studio",
    opportunities: "Opportunities",
    library: "Library",
    settings: "Workspace settings",
    help: "Help & docs",
  };
  return labels[view] || "Overview";
}

function sourceTypeLabel(sourceType) {
  if (/github_pr/i.test(sourceType || "")) return "PR";
  if (/github_commit/i.test(sourceType || "")) return "Commit";
  if (/release/i.test(sourceType || "")) return "Release";
  if (/note/i.test(sourceType || "")) return "Note";
  return "Source";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function wordCount(text = "") {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function buildWorkflowProgress({ workspace, activities, clusters, acceptedMoment, draftRows }) {
  const hasContext = Boolean(workspace?.name && workspace?.description && workspace?.target_audience);
  const states = [
    ["Product context", hasContext],
    ["Source activity", activities.length > 0],
    ["Launch moments", clusters.length > 0],
    ["Human-reviewed draft", Boolean(acceptedMoment && draftRows.length)],
    ["Library", draftRows.length > 0],
  ];
  const firstOpenIndex = states.findIndex(([, done]) => !done);
  return states.map(([label, done], index) => ({
    label,
    state: done ? "Done" : index === firstOpenIndex ? "Current" : "Locked",
  }));
}

function buildNextAction({ activities, clusters, acceptedMoment, draftRows, onSources, onImport, onDetect, onReview, onDraft, onLibrary }) {
  if (!activities.length) {
    return {
      title: "Import the first source trail",
      body: "LaunchRelay needs source activity before it can detect launch-worthy product stories. Start with GitHub activity or pasted shipped-work notes.",
      label: "Import source activity",
      onAction: onImport || onSources,
    };
  }
  if (!clusters.length) {
    return {
      title: "Detect launch moments",
      body: "Source receipts are available. Run detection to group related changes into reviewable story candidates.",
      label: "Detect launch moments",
      onAction: onDetect,
    };
  }
  if (!acceptedMoment) {
    return {
      title: "Review the strongest candidate",
      body: "Launch moments should not become content automatically. Inspect the evidence, then accept the moment worth drafting.",
      label: "Review launch moments",
      onAction: onReview,
    };
  }
  if (!draftRows.length) {
    return {
      title: "Create the first source-grounded draft",
      body: "A human-reviewed launch moment is ready. Open Story Studio to create an editable draft from the accepted evidence.",
      label: "Open Story Studio",
      onAction: onDraft,
    };
  }
  return {
    title: "Review durable work in Library",
    body: "A draft exists. Check the Library to mark ready, search saved work, or continue expanding follow-up opportunities.",
    label: "Open Library",
    onAction: onLibrary,
  };
}

function sourceModeLabel(activities) {
  if (!activities.length) return "No source records yet";
  const sourceTypes = new Set(activities.map((item) => sourceTypeLabel(item.source_type)));
  return `${Array.from(sourceTypes).join(" + ")} source records`;
}

function sameOpportunity(left, right) {
  if (left.id && right.id) return left.id === right.id;
  return left.title === right.title && left.format === right.format;
}


function initialViewFromLocation() {
  if (typeof window === "undefined") return "public-home";
  const hashRoute = extractHashRoute(window.location.hash);
  if (appRouteIds.includes(hashRoute) || publicRouteIds.includes(hashRoute)) return hashRoute;
  return "public-home";
}

function extractHashRoute(hash) {
  return String(hash || "")
    .replace(/^#\/?/, "")
    .split("?")[0]
    .split("&")[0]
    .trim();
}

function isAppRoute(view) {
  return appRouteIds.includes(view);
}

function writeViewToUrl(view, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const nextHash = view === "public-home" ? "" : `#/${view}`;
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  if (replace) {
    window.history.replaceState({}, document.title, nextUrl);
  } else if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.history.pushState({}, document.title, nextUrl);
  }
}

function normalizeResponse(response) {
  return response?.data ?? response;
}

function normalizeListResponse(response) {
  const data = normalizeResponse(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function resetWorkspaceState(setters) {
  const { setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities } = setters;
  setWorkspace(initialWorkspace);
  setWorkspaceRecord(null);
  setActivities([]);
  setClusters([]);
  setSelectedCluster(null);
  setDraft(null);
  setOpportunities([]);
}

async function loadUserWorkspaceData(user, setters) {
  const { setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities } = setters;
  try {
    const workspaces = normalizeListResponse(await ProductWorkspace.list("-updated_date", 25));
    let workspaceRecord = selectUserOwnedRecord(workspaces, user);

    if (!workspaceRecord) {
      const activityRecords = normalizeUserScopedList(normalizeListResponse(await ActivityItem.list("-updated_date", 100)), user);
      if (!activityRecords.length) return;
      const recoveredWorkspaceId = activityRecords[0].workspace_id || "local_workspace";
      workspaceRecord = { id: recoveredWorkspaceId, ...initialWorkspace };
      setWorkspace(workspaceRecord);
      setWorkspaceRecord(workspaceRecord);
      await hydrateWorkspaceChildren(recoveredWorkspaceId, user, setters, activityRecords);
      return;
    }

    setWorkspace({ ...initialWorkspace, ...workspaceRecord });
    setWorkspaceRecord(workspaceRecord);
    await hydrateWorkspaceChildren(workspaceRecord.id, user, setters);
  } catch (error) {
    console.warn("Could not restore workspace records yet:", error);
  }
}

async function hydrateWorkspaceChildren(workspaceId, user, setters, preloadedActivities = null) {
  const { setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities } = setters;
  const workspaceQuery = { workspace_id: workspaceId };
  const [activityRecords, clusterRecords, draftRecords, opportunityRecords] = await Promise.all([
    preloadedActivities || ActivityItem.filter(workspaceQuery, "-occurred_at", 100),
    LaunchCluster.filter(workspaceQuery, "-updated_date", 50),
    Draft.filter(workspaceQuery, "-updated_date", 20),
    Opportunity.filter(workspaceQuery, "-updated_date", 50),
  ]);
  const loadedActivities = Array.isArray(preloadedActivities) ? preloadedActivities : normalizeUserScopedList(normalizeListResponse(activityRecords), user);
  const loadedClusters = normalizeUserScopedList(normalizeListResponse(clusterRecords), user);
  const loadedDrafts = normalizeUserScopedList(normalizeListResponse(draftRecords), user);
  const loadedOpportunities = normalizeUserScopedList(normalizeListResponse(opportunityRecords), user);
  setActivities(loadedActivities);
  setClusters(loadedClusters);
  setSelectedCluster(loadedClusters.find((cluster) => cluster.status === "accepted" || cluster.status === "edited") || loadedClusters[0] || null);
  setDraft(loadedDrafts[0] || null);
  setOpportunities(loadedOpportunities);
}

function selectUserOwnedRecord(records, user) {
  const items = Array.isArray(records) ? records : [];
  if (!items.length) return null;
  const owned = items.filter((record) => isRecordOwnedByUser(record, user));
  if (owned.length) return owned[0];
  const exposesOwnerMetadata = items.some(recordHasOwnerMetadata);
  return exposesOwnerMetadata ? null : items[0];
}

function normalizeUserScopedList(records, user) {
  const items = Array.isArray(records) ? records : [];
  const owned = items.filter((record) => isRecordOwnedByUser(record, user));
  if (owned.length) return owned;
  const exposesOwnerMetadata = items.some(recordHasOwnerMetadata);
  return exposesOwnerMetadata ? [] : items;
}

function recordHasOwnerMetadata(record) {
  return Boolean(record && (record.created_by || record.created_by_id || record.user_id || record.owner_id || record.owner_email));
}

function isRecordOwnedByUser(record, user) {
  if (!record || !user) return false;
  const userIds = [user.id, user._id, user.user_id, user.created_by_id].filter(Boolean).map((value) => String(value).toLowerCase());
  const userEmails = [user.email, user.created_by].filter(Boolean).map((value) => String(value).toLowerCase());
  const recordIds = [record.created_by_id, record.user_id, record.owner_id].filter(Boolean).map((value) => String(value).toLowerCase());
  const recordEmails = [record.created_by, record.owner_email, record.email].filter(Boolean).map((value) => String(value).toLowerCase());
  return recordIds.some((value) => userIds.includes(value)) || recordEmails.some((value) => userEmails.includes(value));
}

function avatarInitials(name, email) {
  const source = (name && name !== "LaunchRelay" ? name : email || "LR").trim();
  const parts = source.includes("@") ? source.split("@")[0].split(/[._-]+/) : source.split(/\s+/);
  return parts.filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "LR";
}

function displayUserName(user) {
  return user?.full_name || user?.name || user?.email || "Signed-in user";
}

function isValidUserSession(user) {
  return Boolean(user && (user.id || user.email || user.created_by_id));
}

function hydrateAuthTokenFromUrl() {
  if (typeof window === "undefined") return null;
  const hashParts = String(window.location.hash || "").split("?");
  const hashParams = new URLSearchParams(hashParts[1] || "");
  const searchParams = new URLSearchParams(window.location.search || "");
  const token = hashParams.get("access_token") || searchParams.get("access_token");
  if (!token) return null;

  base44.setToken(token);
  rememberPostLoginView(extractHashRoute(window.location.hash) || "overview");

  hashParams.delete("access_token");
  hashParams.delete("is_new_user");
  searchParams.delete("access_token");
  searchParams.delete("is_new_user");

  const cleanHashRoute = extractHashRoute(window.location.hash) || "overview";
  const cleanHashQuery = hashParams.toString();
  const cleanHash = `#/${cleanHashRoute}${cleanHashQuery ? `?${cleanHashQuery}` : ""}`;
  const cleanSearch = searchParams.toString();
  const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${cleanHash}`;
  window.history.replaceState({}, document.title, cleanUrl);
  return token;
}

function hasLocalAuthToken() {
  try {
    hydrateAuthTokenFromUrl();
    return Boolean(window.localStorage.getItem("base44_access_token") || window.localStorage.getItem("token"));
  } catch (error) {
    return false;
  }
}

function rememberPostLoginView(view) {
  try {
    window.localStorage.setItem("launchrelay_post_login_view", view);
  } catch (error) {
    console.warn("Could not remember post-login view:", error);
  }
}

function consumePostLoginView() {
  try {
    const view = window.localStorage.getItem("launchrelay_post_login_view");
    forgetPostLoginView();
    return view;
  } catch (error) {
    return null;
  }
}

function forgetPostLoginView() {
  try {
    window.localStorage.removeItem("launchrelay_post_login_view");
  } catch (error) {
    console.warn("Could not clear post-login view:", error);
  }
}

function clearLocalAuthToken() {
  try {
    window.localStorage.removeItem("base44_access_token");
    window.localStorage.removeItem("token");
  } catch (error) {
    console.warn("Could not clear local auth token:", error);
  }
}

async function fetchPublicGitHubPayloads(owner, repo) {
  const [repoResponse, pullsResponse, commitsResponse, releasesResponse] = await Promise.all([
    fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}`),
    fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=20`),
    fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`),
    fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`),
  ]);

  return {
    repo: repoResponse,
    pulls: pullsResponse,
    commits: commitsResponse,
    releases: releasesResponse,
  };
}

async function invokeFunctionWithTimeout(functionName, payload, timeoutMs = 8000) {
  return Promise.race([
    base44.functions.invoke(functionName, payload),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${functionName} timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Public GitHub repo not found. Private repos require a later OAuth connection.");
    throw new Error(`GitHub API request failed with ${response.status}.`);
  }
  return response.json();
}
