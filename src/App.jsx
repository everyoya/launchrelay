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
  { id: "workspace", label: "Workspace", icon: Home },
  { id: "review", label: "Review", icon: CircleDot },
  { id: "draft", label: "Draft", icon: PenLine },
  { id: "library", label: "Library", icon: Library },
  { id: "settings", label: "Settings", icon: Settings },
];

const hiddenInternalRouteIds = ["sources", "opportunities", "help"];
const legacyRouteAliases = {
  overview: "workspace",
  "launch-moments": "review",
  "story-studio": "draft",
};
const appRouteIds = [...appNav.map((item) => item.id), ...hiddenInternalRouteIds, ...Object.keys(legacyRouteAliases)];
const publicRouteIds = ["public-home", "sign-in"];

const sampleActivity = `PR: Added onboarding checklist for first workspace setup
Commit: fixed signup redirect after account creation
Note: users were confused after account creation, so we added clearer first-run guidance
Feature: added welcome screen copy that explains the next best action`;

const sampleManualNotes = sampleActivity.split("\n").map((body, index) => ({
  id: `note_${index + 1}`,
  body,
}));

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

function formatRelativeDate(value) {
  if (!value) return nowLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return nowLabel;
  const today = new Date();
  const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getSourcesForCluster(cluster, activities = []) {
  const sourceIds = cluster?.activity_item_ids || [];
  if (!sourceIds.length) return [];
  return activities.filter((item) => sourceIds.includes(item.id));
}

export default function App() {
  const [view, setView] = useState(() => initialViewFromLocation());
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [workspaceRecord, setWorkspaceRecord] = useState(null);
  const [activityText, setActivityText] = useState(sampleActivity);
  const [manualNotes, setManualNotes] = useState(sampleManualNotes);
  const [githubRepoInput, setGithubRepoInput] = useState(initialWorkspace.primary_repo_url);
  const [activities, setActivities] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [draft, setDraft] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [sourceTab, setSourceTab] = useState("context");
  const [libraryTab, setLibraryTab] = useState("Drafts");
  const [launchFilter, setLaunchFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState("welcome");
  const [onboardingDraft, setOnboardingDraft] = useState({ initiativeName: "", problem: "", audience: "End Users", knowledgeChoice: "GitHub" });
  const [isBusy, setIsBusy] = useState(false);
  const [importPhase, setImportPhase] = useState("idle");
  const [status, setStatus] = useState(null);

  const lockedAppRoute = !currentUser && !demoMode && isAppRoute(view);
  const renderedView = lockedAppRoute ? "sign-in" : normalizeAppRoute(view);
  const isPublic = renderedView.startsWith("public") || renderedView === "sign-in";
  const shouldShowOnboarding = Boolean(currentUser && !demoMode && renderedView === "workspace" && !workspaceRecord && activities.length === 0);

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
          goApp("workspace", { replace: true });
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
    const normalizedView = normalizeAppRoute(nextView);
    setView(normalizedView);
    setSidebarOpen(false);
    setUserMenuOpen(false);
    writeViewToUrl(normalizedView, options);
  }

  function goPublic(nextView = "public-home", options = {}) {
    setView(nextView);
    setSidebarOpen(false);
    setUserMenuOpen(false);
    writeViewToUrl(nextView, options);
  }

  function enterSystem(nextView = "workspace") {
    goApp(nextView);
  }

  function startAuthProviderLogin(provider) {
    rememberPostLoginView("workspace");
    base44.auth.loginWithProvider(provider, `${window.location.origin}${window.location.pathname}#/workspace`);
  }

  async function completeAuthenticatedEntry(user) {
    if (!isValidUserSession(user)) throw new Error("No active Base44 user session");
    setDemoMode(false);
    resetWorkspaceState({ setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities });
    setCurrentUser(user);
    setStatus({ tone: "loading", message: "Opening your workspace..." });
    await loadUserWorkspaceData({ setWorkspace, setWorkspaceRecord, setActivities, setClusters, setSelectedCluster, setDraft, setOpportunities }, user);
    setStatus({ tone: "success", message: "Workspace opened." });
    goApp("workspace", { replace: true });
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
    setManualNotes(sampleManualNotes);
    setActivities(seededActivities);
    setClusters(seededClusters);
    setSelectedCluster(seededClusters[0] || null);
    setDraft(null);
    setOpportunities([]);
    setImportPhase("complete");
    setStatus({ tone: "success", message: "Sample workspace loaded with evidence and a suggested improvement." });
    goApp("workspace");
  }

  function completeV2Onboarding() {
    const nextWorkspace = {
      ...workspace,
      name: onboardingDraft.initiativeName.trim() || "AI Assistant",
      description: onboardingDraft.problem.trim() || "Helps users complete product work with less repeated context.",
      target_audience: onboardingDraft.audience,
    };
    const workspaceRecordSeed = { id: "local_workspace", ...nextWorkspace };
    const importedAt = new Date().toISOString();
    const seededActivities = createManualActivityItemsFromText(sampleActivity, {
      workspaceId: workspaceRecordSeed.id,
      importedAt,
      idPrefix: "onboarding_evidence",
    });
    const seededClusters = generateDeterministicLaunchClusters(seededActivities, {
      workspaceId: workspaceRecordSeed.id,
      targetAudience: nextWorkspace.target_audience,
      manualContext: nextWorkspace.description,
    }).map((cluster, index) => ({ ...cluster, id: `local_cluster_${index + 1}` }));
    setWorkspace(nextWorkspace);
    setWorkspaceRecord(workspaceRecordSeed);
    setActivityText(sampleActivity);
    setManualNotes(sampleManualNotes);
    setActivities(seededActivities);
    setClusters(seededClusters);
    setSelectedCluster(seededClusters[0] || null);
    setDraft(null);
    setOpportunities([]);
    setImportPhase("complete");
    setOnboardingStep("welcome");
    setStatus({ tone: "success", message: `We found ${seededClusters.length} meaningful improvements worth reviewing.` });
    goApp("review");
  }

  async function importManualActivity() {
    setIsBusy(true);
    setImportPhase("normalizing");
    setStatus({ tone: "loading", message: "Normalizing pasted activity into source records..." });
    const activeWorkspace = await ensureWorkspaceRecord();
    const workspaceId = activeWorkspace.id;
    const importedAt = new Date().toISOString();
    const noteText = compileManualNotes(manualNotes, activityText);

    try {
      const response = await base44.functions.invoke("normalizeActivity", {
        activityText: noteText,
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
      const normalized = createManualActivityItemsFromText(noteText, {
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
      goApp("review");
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
      goApp("review");
    } finally {
      setIsBusy(false);
    }
  }

  async function acceptCluster(cluster) {
    const updated = { ...cluster, status: "accepted" };
    setSelectedCluster(updated);
    setClusters((items) => items.map((item) => (item.id === cluster.id ? updated : item)));
    setStatus({ tone: "success", message: "Human review complete. Opening Draft." });
    goApp("draft");
    try {
      if (cluster.id && !String(cluster.id).startsWith("local_")) await LaunchCluster.update(cluster.id, { status: "accepted" });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Launch moment accepted locally. Opening Draft." });
    }
  }

  async function createDraft() {
    if (!acceptedCluster) {
      setStatus({ tone: "warning", message: "Accept an improvement before creating a draft." });
      goApp("review");
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
      setStatus({ tone: "warning", message: "Accept an improvement before expanding opportunities." });
      goApp("review");
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
      setStatus({ tone: "success", message: "Draft saved." });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Draft saved locally for this session. Remote save can be retried later." });
    }
  }

  async function publishDraft() {
    if (!draft) return;
    const publishedAt = new Date().toISOString();
    const updated = { ...draft, status: "published", updated_at: publishedAt, published_at: publishedAt };
    setDraft(updated);
    setLibraryTab("Published");
    try {
      if (draft.id && !String(draft.id).startsWith("local_")) await Draft.update(draft.id, { title: draft.title, body: draft.body, status: "published", published_at: publishedAt });
      setStatus({ tone: "success", message: "Draft published." });
    } catch (error) {
      console.error(error);
      setStatus({ tone: "warning", message: "Draft published locally for this session." });
    }
  }

  async function markDraftReady() {
    if (!draft) return;
    const updated = { ...draft, status: "ready", updated_at: new Date().toISOString() };
    setDraft(updated);
    setLibraryTab("Drafts");
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
    setStatus({ tone: "success", message: "Opportunity promoted. Draft is preloaded with the reviewed improvement." });
    goApp("draft");
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

  if (shouldShowOnboarding) {
    return (
      <V2Onboarding
        step={onboardingStep}
        setStep={setOnboardingStep}
        draft={onboardingDraft}
        setDraft={setOnboardingDraft}
        onComplete={completeV2Onboarding}
        improvementCount={clusters.length || 4}
      />
    );
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
        <Sidebar view={renderedView} goApp={goApp} goPublic={goPublic} workspace={workspace} currentUser={currentUser} demoMode={demoMode} onLogout={logout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} />
        <div className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
          <Topbar view={renderedView} goApp={goApp} workspace={workspace} currentUser={currentUser} demoMode={demoMode} onLogout={logout} userMenuOpen={userMenuOpen} setUserMenuOpen={setUserMenuOpen} setSidebarOpen={setSidebarOpen} />
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <StatusNotice status={status} isBusy={isBusy} />
            {renderedView === "workspace" && <WorkspaceScreen activities={activities} clusters={clusters} draftRows={draftRows} onReview={(cluster) => { setSelectedCluster(cluster); goApp("review"); }} onNewInitiative={() => goApp("sources")} />}
            {renderedView === "sources" && <Sources workspace={workspace} setWorkspace={setWorkspace} onSave={saveWorkspace} sourceTab={sourceTab} setSourceTab={setSourceTab} activityText={activityText} setActivityText={setActivityText} manualNotes={manualNotes} setManualNotes={setManualNotes} githubRepoInput={githubRepoInput} setGithubRepoInput={setGithubRepoInput} activities={activities} importPhase={importPhase} isBusy={isBusy} onImport={importManualActivity} onGitHubImport={importGitHubActivity} onDetect={detectLaunchMoments} />}
            {renderedView === "review" && <LaunchMoments clusters={clusters} activities={activities} selectedCluster={selectedCluster} selectedSources={selectedSources} setSelectedCluster={setSelectedCluster} onAccept={acceptCluster} onDetect={detectLaunchMoments} isBusy={isBusy} launchFilter={launchFilter} setLaunchFilter={setLaunchFilter} />}
            {renderedView === "draft" && <DraftScreen cluster={acceptedCluster} sourceItems={acceptedSources} draft={draft} setDraft={setDraft} onSaveDraft={saveDraft} onPublishDraft={publishDraft} onCreateDraft={createDraft} isBusy={isBusy} onBack={() => goApp("review")} />}
            {renderedView === "opportunities" && <Opportunities opportunities={visibleOpportunities} cluster={acceptedCluster} onCreateOpportunities={createOpportunities} onSaveOpportunity={saveOpportunity} onPromote={promoteOpportunity} onIgnore={ignoreOpportunity} isBusy={isBusy} />}
            {renderedView === "library" && <LibraryScreen libraryTab={libraryTab} setLibraryTab={setLibraryTab} draftRows={draftRows} clusters={clusters} activities={activities} onReview={(cluster) => { setSelectedCluster(cluster); goApp("review"); }} onDraft={() => goApp("draft")} onWorkspace={() => goApp("workspace")} librarySearch={librarySearch} setLibrarySearch={setLibrarySearch} />}
            {renderedView === "settings" && <SettingsScreen workspace={workspace} currentUser={currentUser} demoMode={demoMode} onLogout={logout} githubRepoInput={githubRepoInput} activities={activities} />}
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
  const scrollToLandingSection = (sectionId) => {
    if (isAuth) goPublic("public-home");
    window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <div className="min-h-screen bg-[var(--lr-canvas)] text-[var(--lr-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--lr-border)] bg-white/86 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4">
          <button onClick={() => goPublic("public-home")} className="flex items-center gap-3 text-left" aria-label="Go to LaunchRelay home">
            <BrandMark />
            <div>
              <div className="font-semibold tracking-tight">LaunchRelay</div>
            </div>
          </button>
          {!isAuth && <nav className="hidden items-center gap-6 text-sm font-medium text-[var(--lr-text-2)] md:flex" aria-label="Landing page navigation">
            <button onClick={() => scrollToLandingSection("product")} className="hover:text-[var(--lr-text)]">Product</button>
            <button onClick={() => scrollToLandingSection("how-it-works")} className="hover:text-[var(--lr-text)]">How It Works</button>
            <button onClick={() => scrollToLandingSection("pricing")} className="hover:text-[var(--lr-text)]">Pricing</button>
            <button onClick={() => scrollToLandingSection("docs")} className="hover:text-[var(--lr-text)]">Docs</button>
          </nav>}
          <div className="flex items-center gap-2 sm:gap-3">
            {currentUser ? (
              <>
                <Button variant="ghost" onClick={onLogout} className="rounded-xl text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Sign out</Button>
                <Button onClick={() => goApp("workspace")} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Open Workspace</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => goPublic("sign-in")} className="rounded-xl text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]">Sign in</Button>
                {!isAuth && <Button onClick={() => goPublic("sign-in")} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Get Started</Button>}
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
  const startProduct = () => currentUser ? goApp("workspace") : goPublic("sign-in");
  return (
    <main className="overflow-hidden">
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--lr-orange)]">Product communication from shipped work</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.055em] text-[var(--lr-text)] md:text-7xl">
            Your team ships great work. Make sure people understand it.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--lr-text-2)]">
            LaunchRelay discovers the Highlights hidden in your shipped work and turns them into clear, source-grounded product stories your users actually care about.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={startProduct} className="h-12 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
            <button type="button" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--lr-border)] bg-white px-5 text-sm font-medium text-[var(--lr-text)] transition-colors hover:bg-[var(--lr-surface-2)]">See How It Works</button>
          </div>
        </div>
        <LandingVisualPlaceholder label="Hero product preview placeholder" />
      </section>

      <section className="border-y border-[var(--lr-border)] bg-white/60" aria-label="Supported integrations">
        <div className="mx-auto max-w-7xl px-5 py-8">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.16em] text-[var(--lr-muted)]">Works with the tools your team already uses.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm font-medium text-[var(--lr-text-2)]">
            {["GitHub", "Linear", "Notion", "Jira", "Manual Uploads"].map((tool) => <span key={tool} className="rounded-full border border-[var(--lr-border)] bg-white px-4 py-2">{tool}</span>)}
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--lr-orange)]">The problem</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-6xl">Shipping is only half the job.</h2>
        </div>
        <div className="max-w-3xl space-y-5 text-xl leading-9 text-[var(--lr-text-2)]">
          <p>Every sprint, your team ships valuable improvements.</p>
          <p>Bug fixes. Performance gains. Quality-of-life updates. New capabilities.</p>
          <p>Most of them never become stories.</p>
          <p>Users miss the value because nobody has time to explain what changed or why it matters.</p>
          <p className="font-medium text-[var(--lr-text)]">LaunchRelay exists to close that gap.</p>
        </div>
      </section>

      <section id="how-it-works" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--lr-orange)]">How LaunchRelay works</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-6xl">From shipped work to clear product stories.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <LandingStep icon={GitBranch} number="01" title="Connect your work" body="Bring in GitHub, Notion, Linear, documents, or manual updates." />
            <LandingStep icon={Lightbulb} number="02" title="Discover Highlights" body="LaunchRelay identifies meaningful work worth communicating." />
            <LandingStep icon={CheckCircle2} number="03" title="Review and publish" body="Review the strongest Highlights and create source-grounded drafts with confidence." />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:py-28">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--lr-orange)]">Product preview</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-6xl">See the workflow, not a fake dashboard.</h2>
        </div>
        <LandingVisualPlaceholder label="Large LaunchRelay screenshot placeholder" large />
      </section>

      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-5">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--lr-orange)]">Why LaunchRelay</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-6xl">Designed around the work your users should notice.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <PrincipleCard title="Never miss important work" body="Discover launch-worthy Highlights automatically." />
            <PrincipleCard title="Stay grounded" body="Every draft links back to the work that inspired it." />
            <PrincipleCard title="Keep your team aligned" body="One place to discover, review, and communicate product updates." />
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-4xl px-5 py-20 text-center lg:py-28">
        <h2 className="text-4xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-6xl">Great products deserve great communication.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--lr-text-2)]">Start discovering the stories already hidden inside your product work.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={startProduct} className="h-12 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <button type="button" onClick={() => goApp("workspace")} className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--lr-border)] bg-white px-5 text-sm font-medium text-[var(--lr-text)] transition-colors hover:bg-[var(--lr-surface-2)]">Open Workspace</button>
        </div>
      </section>

      <footer id="docs" className="border-t border-[var(--lr-border)] bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-[var(--lr-text-2)] md:flex-row md:items-center md:justify-between">
          <div className="font-semibold text-[var(--lr-text)]">LaunchRelay</div>
          <div className="flex flex-wrap gap-4">
            {["Product", "Docs", "Privacy", "Terms", "Contact"].map((link) => <span key={link}>{link}</span>)}
          </div>
        </div>
      </footer>
    </main>
  );
}

function LandingVisualPlaceholder({ label, large = false }) {
  return (
    <div className={`rounded-[32px] border border-[var(--lr-border)] bg-white p-4 shadow-[var(--lr-shadow)] ${large ? "min-h-[520px]" : "min-h-[420px]"}`}>
      <div className="flex h-full min-h-[inherit] items-center justify-center rounded-[24px] border border-dashed border-[var(--lr-border)] bg-[var(--lr-canvas)] p-8 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--lr-orange)] shadow-sm"><Layers3 className="h-5 w-5" /></div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--lr-muted)]">{label}</p>
          <p className="mx-auto mt-3 max-w-md text-lg font-medium leading-7 text-[var(--lr-text)]">Real LaunchRelay screenshot coming soon.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--lr-text-2)]">This space is reserved for the actual product preview Yotam will provide.</p>
        </div>
      </div>
    </div>
  );
}

function LandingStep({ icon: Icon, number, title, body }) {
  return <article className="rounded-[28px] border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-6"><div className="flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--lr-orange)] shadow-sm"><Icon className="h-5 w-5" /></div><span className="text-xs font-semibold text-[var(--lr-muted)]">{number}</span></div><h3 className="mt-8 text-xl font-semibold tracking-[-0.025em] text-[var(--lr-text)]">{title}</h3><p className="mt-3 leading-7 text-[var(--lr-text-2)]">{body}</p></article>;
}

function PrincipleCard({ title, body }) {
  return <article className="rounded-[28px] border border-[var(--lr-border)] bg-white p-6"><h3 className="text-xl font-semibold tracking-[-0.025em] text-[var(--lr-text)]">{title}</h3><p className="mt-4 leading-7 text-[var(--lr-text-2)]">{body}</p></article>;
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
          <Button onClick={() => goApp("workspace")} className="mt-6 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Open workspace</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-md items-center px-5 py-12">
      <section className="lr-work-surface p-6 md:p-7">
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">Sign in to LaunchRelay</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">Use Google, GitHub, or email.</p>
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

function Sidebar({ view, goApp, goPublic, workspace, currentUser, demoMode, onLogout, sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed }) {
  return (
    <>
      <div className={`fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm lg:hidden ${sidebarOpen ? "block" : "hidden"}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--lr-border)] bg-white transition-[transform,width] duration-200 lg:translate-x-0 ${sidebarCollapsed ? "lg:w-20" : "lg:w-72"} ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className={`flex items-center border-b border-[var(--lr-border)] px-5 py-4 ${sidebarCollapsed ? "lg:justify-center lg:px-3" : "justify-between"}`}>
          <button onClick={() => goPublic("public-home")} className={`flex items-center gap-3 text-left ${sidebarCollapsed ? "lg:justify-center" : ""}`} aria-label="Open public home">
            <BrandMark />
            <div className={sidebarCollapsed ? "lg:sr-only" : ""}>
              <div className="font-semibold">LaunchRelay</div>
              <div className="text-xs text-[var(--lr-muted)]">Workspace</div>
            </div>
          </button>
          <button className="hidden rounded-lg p-2 text-[var(--lr-muted)] hover:bg-[var(--lr-surface-2)] lg:block" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><Menu className="h-4 w-4" /></button>
          <button className="rounded-lg p-2 text-[var(--lr-muted)] hover:bg-[var(--lr-surface-2)] lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X className="h-4 w-4" /></button>
        </div>
        <nav className="flex-1 space-y-1 px-3 pt-6" aria-label="App navigation">
          {appNav.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button key={id} onClick={() => goApp(id)} title={sidebarCollapsed ? label : undefined} className={`flex w-full items-center rounded-xl py-2.5 text-sm font-medium transition ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"} ${active ? "bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)] hover:text-[var(--lr-text)]"}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className={sidebarCollapsed ? "sr-only" : ""}>{label}</span>
              </button>
            );
          })}
        </nav>

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

function V2Onboarding({ step, setStep, draft, setDraft, onComplete, improvementCount = 4 }) {
  const stepOrder = ["welcome", "initiative", "details", "knowledge", "analysis", "success"];
  const currentIndex = Math.max(0, stepOrder.indexOf(step));
  const progressLabel = step === "welcome" ? "Welcome" : step === "analysis" ? "Analysis" : step === "success" ? "Ready for Review" : `${currentIndex} of 3`;
  const updateDraft = (key, value) => setDraft({ ...draft, [key]: value });
  const advance = (nextStep) => setStep(nextStep);

  useEffect(() => {
    if (step !== "analysis") return undefined;
    const timer = window.setTimeout(() => setStep("success"), 900);
    return () => window.clearTimeout(timer);
  }, [step, setStep]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--lr-canvas)] px-5 py-10 text-[var(--lr-text)]">
      <section className="w-full max-w-[720px] rounded-[32px] border border-[var(--lr-border)] bg-white p-6 shadow-[var(--lr-shadow)] md:p-9">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><BrandMark /><div className="font-semibold">LaunchRelay</div></div>
          <div className="rounded-full bg-[var(--lr-surface-2)] px-3 py-1 text-xs font-medium text-[var(--lr-muted)]">{progressLabel}</div>
        </div>

        {step === "welcome" && <OnboardingFrame headline="Every great story starts with context." support="Before we can discover Highlights worth sharing, we need to understand your product, your audience, and the work behind it. It only takes a few minutes."><Button onClick={() => advance("initiative")} className="mt-7 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Continue</Button></OnboardingFrame>}

        {step === "initiative" && <OnboardingFrame headline="What are we working on?" support="An Initiative represents one area of your product. Examples: Search, Dashboard, Authentication."><Field label="Initiative Name" value={draft.initiativeName} onChange={(value) => updateDraft("initiativeName", value)} help="Example: AI Assistant" /><Button onClick={() => advance("details")} className="mt-7 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Continue</Button></OnboardingFrame>}

        {step === "details" && <OnboardingFrame headline="Tell us about it." support="The answer helps LaunchRelay understand future improvements."><label className="block"><span className="mb-2 block text-sm font-medium text-[var(--lr-text)]">What problem does this solve for users?</span><textarea value={draft.problem} onChange={(event) => updateDraft("problem", event.target.value)} className="min-h-32 w-full rounded-xl border border-[var(--lr-border)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--lr-orange)] focus:ring-2 focus:ring-[var(--lr-orange-tint)]" /></label><label className="mt-4 block"><span className="mb-2 block text-sm font-medium text-[var(--lr-text)]">Who is this for?</span><select value={draft.audience} onChange={(event) => updateDraft("audience", event.target.value)} className="h-11 w-full rounded-xl border border-[var(--lr-border)] bg-white px-3 text-sm outline-none focus:border-[var(--lr-orange)] focus:ring-2 focus:ring-[var(--lr-orange-tint)]"><option>End Users</option><option>Developers</option><option>Enterprise Admins</option><option>Designers</option><option>Internal Team</option></select></label><Button onClick={() => advance("knowledge")} className="mt-7 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Continue</Button></OnboardingFrame>}

        {step === "knowledge" && <OnboardingFrame headline="Where should LaunchRelay learn from?" support="Choose one starting point. Each option is treated equally."><div className="grid gap-3 sm:grid-cols-3">{["GitHub", "Paste Updates", "Release Notes"].map((choice) => <button key={choice} onClick={() => updateDraft("knowledgeChoice", choice)} className={`rounded-2xl border p-4 text-left text-sm transition hover:-translate-y-0.5 hover:shadow-sm ${draft.knowledgeChoice === choice ? "border-[var(--lr-orange)] bg-[var(--lr-orange-tint)] text-[var(--lr-orange)]" : "border-[var(--lr-border)] bg-white text-[var(--lr-text-2)]"}`}>{choice}</button>)}</div><Button onClick={() => advance("analysis")} className="mt-7 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Continue</Button></OnboardingFrame>}

        {step === "analysis" && <OnboardingFrame headline="Understanding your product..." support="Reading recent improvements... Connecting technical work with user value... Looking for meaningful changes..."><div className="mt-7 flex items-center gap-3 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm text-[var(--lr-text-2)]"><Loader2 className="h-4 w-4 animate-spin text-[var(--lr-orange)]" /> Connecting work with user value...</div></OnboardingFrame>}

        {step === "success" && <OnboardingFrame headline={`We found ${improvementCount} meaningful improvements worth reviewing.`} support="The most interesting one: AI Assistant now remembers previous conversations."><Button onClick={onComplete} className="mt-7 h-11 rounded-xl bg-[var(--lr-orange)] px-5 text-white shadow-none hover:bg-[#d95a2e]">Continue to Review <ArrowRight className="ml-2 h-4 w-4" /></Button></OnboardingFrame>}
      </section>
    </main>
  );
}

function OnboardingFrame({ headline, support, children }) {
  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-[-0.045em] text-[var(--lr-text)] md:text-5xl">{headline}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--lr-text-2)]">{support}</p>
      <div className="mt-7">{children}</div>
    </div>
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

function WorkspaceScreen({ activities, clusters, draftRows, onReview, onNewInitiative }) {
  const waitingImprovements = clusters.filter((cluster) => cluster.status !== "accepted" && cluster.status !== "edited");
  const completedDrafts = draftRows.filter((item) => item.status === "ready" || item.status === "published");
  return (
    <Page title="Workspace" eyebrow="Workspace" description="Here's what needs your attention today." action={<WorkspaceHeaderActions />}>
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--lr-text)]">Needs Review</h2>
          </div>
          {waitingImprovements.length ? (
            <div className="grid gap-4">
              {waitingImprovements.map((cluster) => <ImprovementCard key={cluster.id || cluster.title} cluster={cluster} activities={activities} onReview={() => onReview(cluster)} />)}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="You're all caught up." body="LaunchRelay hasn't found any new improvements worth reviewing. Check back after your team ships more work." />
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-[-0.02em] text-[var(--lr-text)]">Recently Completed</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completedDrafts.length ? completedDrafts.map((item) => <button key={item.id || item.title} className="rounded-2xl border border-[var(--lr-border)] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="font-semibold text-[var(--lr-text)]">✓ {item.title}</div><div className="mt-2 text-sm text-[var(--lr-muted)]">{item.status === "published" ? "Published" : "Approved"}</div></button>) : <div className="rounded-2xl border border-dashed border-[var(--lr-border)] bg-white p-5 text-sm text-[var(--lr-muted)]">Approved drafts will appear here.</div>}
          </div>
        </section>

        <div className="border-t border-[var(--lr-border)] pt-5">
          <Button onClick={onNewInitiative} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">+ New Initiative</Button>
        </div>
      </div>
    </Page>
  );
}

function WorkspaceHeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <label className="hidden items-center gap-2 rounded-xl border border-[var(--lr-border)] bg-white px-3 py-2 text-sm text-[var(--lr-muted)] md:flex"><Search className="h-4 w-4" /><input aria-label="Search workspace" placeholder="Search" className="w-28 bg-transparent outline-none placeholder:text-[var(--lr-muted)]" /></label>
      <button className="rounded-xl border border-[var(--lr-border)] bg-white p-2 text-[var(--lr-text-2)] hover:bg-[var(--lr-surface-2)]" aria-label="Notifications"><AlertCircle className="h-4 w-4" /></button>
    </div>
  );
}

function ImprovementCard({ cluster, activities, onReview }) {
  const evidence = activities.filter((item) => cluster.activity_item_ids?.includes(item.id)).slice(0, 2);
  const extraCount = Math.max(0, (cluster.activity_item_ids?.length || 0) - evidence.length);
  return (
    <button onClick={onReview} className="group w-full rounded-[24px] border border-[var(--lr-border)] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--lr-text)]">✨ {cluster.title}</h3>
          <div className="mt-4 text-sm font-semibold text-[var(--lr-text)]">Why it matters</div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--lr-text-2)]">{cluster.user_value || cluster.summary}</p>
          <div className="mt-4 text-sm font-semibold text-[var(--lr-text)]">Based on</div>
          <ul className="mt-2 space-y-1 text-sm text-[var(--lr-text-2)]">
            {evidence.map((item) => <li key={item.id || item.title}>• {item.title || item.summary || "Evidence item"}</li>)}
            {extraCount > 0 && <li>• {extraCount} additional changes</li>}
          </ul>
        </div>
        <span className="shrink-0 rounded-xl bg-[var(--lr-orange)] px-4 py-2 text-sm font-medium text-white transition group-hover:bg-[#d95a2e]">Review →</span>
      </div>
    </button>
  );
}

function Sources({ workspace, setWorkspace, onSave, sourceTab, setSourceTab, activityText, setActivityText, manualNotes, setManualNotes, githubRepoInput, setGithubRepoInput, activities, importPhase, isBusy, onImport, onGitHubImport, onDetect }) {
  return (
    <Page title="Sources" eyebrow="Source trail" description="Create the source trail one step at a time.">
      <SourceSetupFlow
        workspace={workspace}
        setWorkspace={setWorkspace}
        onSave={onSave}
        sourceTab={sourceTab}
        setSourceTab={setSourceTab}
        activityText={activityText}
        setActivityText={setActivityText}
        manualNotes={manualNotes}
        setManualNotes={setManualNotes}
        githubRepoInput={githubRepoInput}
        setGithubRepoInput={setGithubRepoInput}
        activities={activities}
        importPhase={importPhase}
        isBusy={isBusy}
        onImport={onImport}
        onGitHubImport={onGitHubImport}
        onDetect={onDetect}
      />
    </Page>
  );
}

function LaunchMoments({ clusters, activities, selectedCluster, selectedSources, onAccept }) {
  const activeCluster = selectedCluster || clusters.find((cluster) => cluster.status !== "accepted" && cluster.status !== "edited") || clusters[0] || null;
  const activeSources = activities.filter((item) => activeCluster?.activity_item_ids?.includes(item.id));
  const sources = activeSources.length ? activeSources : selectedSources;
  return <HighlightReview cluster={activeCluster} sources={sources} onContinue={onAccept} />;
}

function DraftScreen({ cluster, sourceItems, draft, setDraft, onSaveDraft, onPublishDraft, onCreateDraft, isBusy, onBack }) {
  if (!cluster) {
    return <Page title="Draft" description="Based on Highlight"><div className="mx-auto max-w-[960px]"><EmptyState icon={PenLine} eyebrow="Human review required" title="No Highlight selected" body="Draft opens after a person reviews a Highlight." actionLabel="Review" onAction={onBack} /></div></Page>;
  }
  return (
    <Page title="Draft" description="Based on Highlight">
      <div className="mx-auto max-w-[960px] space-y-8">
        <DraftHighlightContext cluster={cluster} sourceItems={sourceItems} />
        <StoryEditorWorkspace cluster={cluster} sourceItems={sourceItems} draft={draft} setDraft={setDraft} onSaveDraft={onSaveDraft} onPublishDraft={onPublishDraft} onCreateDraft={onCreateDraft} isBusy={isBusy} />
      </div>
    </Page>
  );
}

function Opportunities({ opportunities, cluster, onCreateOpportunities, onSaveOpportunity, isBusy }) {
  return (
    <Page title="Opportunities" eyebrow="Simple expansion" description="Selected accepted moment → generate ideas → save useful ideas." action={<Button onClick={onCreateOpportunities} disabled={isBusy || !cluster} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Generate ideas</Button>}>
      {!cluster ? <EmptyState icon={Lightbulb} eyebrow="Accepted moment required" title="No accepted moment yet" body="Accept a launch moment first. Opportunities expand one reviewed story into useful follow-up ideas." /> : (
        <div className="w-full space-y-5">
          <SectionCard title="Selected accepted moment" description="The source-backed story these ideas will expand.">
            <div className="rounded-2xl border border-[var(--lr-border)] bg-white p-4">
              <h3 className="font-semibold text-[var(--lr-text)]">{cluster.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.summary}</p>
            </div>
          </SectionCard>
          {opportunities.length === 0 ? <EmptyState icon={Lightbulb} eyebrow="Generate ideas" title="No ideas generated yet" body="Generate follow-up ideas from this accepted moment, then save the useful ones." actionLabel="Generate ideas" onAction={onCreateOpportunities} disabled={isBusy} /> : (
            <SectionCard title="Save useful ideas" description="Keep only ideas worth returning to later.">
              <div className="grid gap-4 md:grid-cols-2">
                {opportunities.map((item) => <OpportunityCard key={item.id || item.title} item={item} onSave={() => onSaveOpportunity(item)} />)}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </Page>
  );
}

function LibraryScreen({ libraryTab, setLibraryTab, draftRows, clusters, activities, onReview, onDraft, onWorkspace, librarySearch, setLibrarySearch }) {
  const tabs = ["Drafts", "Suggested Highlights", "Published"];
  const activeTab = tabs.includes(libraryTab) ? libraryTab : "Drafts";
  const query = librarySearch.trim().toLowerCase();
  const suggestedHighlights = clusters.filter((item) => item.status !== "accepted" && item.status !== "drafted");
  const publishedDrafts = draftRows.filter((item) => item.status === "published");
  const visibleDrafts = draftRows.filter((item) => item.status !== "published");
  const matches = (...values) => !query || values.some((value) => String(value || "").toLowerCase().includes(query));
  const filteredDrafts = visibleDrafts.filter((item) => matches(item.title, item.updated_at, item.status));
  const filteredHighlights = suggestedHighlights.filter((item) => matches(item.title, item.why_it_matters, item.user_value, item.summary));
  const filteredPublished = publishedDrafts.filter((item) => matches(item.title, item.updated_at, item.status));
  return (
    <Page title="Library">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap rounded-2xl border border-[var(--lr-border)] bg-white p-1 shadow-sm">{tabs.map((tab) => <LibraryTabButton key={tab} active={activeTab === tab} onClick={() => setLibraryTab(tab)}>{tab}</LibraryTabButton>)}</div>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--lr-border)] bg-white px-3 py-2 text-sm text-[var(--lr-muted)]">
          <Search className="h-4 w-4" />
          <input aria-label="Search library" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search Library" className="min-w-[180px] bg-transparent text-[var(--lr-text)] outline-none placeholder:text-[var(--lr-muted)]" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {activeTab === "Drafts" && (filteredDrafts.length ? filteredDrafts.map((item) => <DraftLibraryCard key={item.id || item.title} draft={item} onDraft={onDraft} />) : <div className="sm:col-span-2 xl:col-span-3"><EmptyState icon={FileText} title={query ? `No drafts match “${librarySearch}”.` : "No drafts yet."} body="Create your first draft from a Highlight." actionLabel="Go to Workspace" onAction={onWorkspace} /></div>)}
        {activeTab === "Suggested Highlights" && (filteredHighlights.length ? filteredHighlights.map((item) => <SuggestedHighlightCard key={item.id || item.title} cluster={item} activities={activities} onReview={onReview} />) : <div className="sm:col-span-2 xl:col-span-3"><EmptyState icon={Sparkles} title={query ? `No Highlights match “${librarySearch}”.` : "No new Highlights right now."} body="We'll keep watching your connected sources." /></div>)}
        {activeTab === "Published" && (filteredPublished.length ? filteredPublished.map((item) => <PublishedCard key={item.id || item.title} draft={item} />) : <div className="sm:col-span-2 xl:col-span-3"><EmptyState icon={Library} title={query ? `No published content matches “${librarySearch}”.` : "Nothing published yet."} body="Publish a draft to see it here." /></div>)}
      </div>
    </Page>
  );
}

function HelpDocsScreen({ goApp }) {
  const guideRows = [
    ["1. Sources", "Tell LaunchRelay what product this is and add source activity."],
    ["2. Launch Moments", "Review source-backed story candidates and accept the ones worth drafting."],
    ["3. Story Studio", "Edit one draft created from an accepted source moment."],
    ["4. Opportunities", "Generate simple follow-up ideas from the accepted moment."],
    ["5. Library", "Find saved drafts, opportunities, and published work."],
  ];
  return (
    <Page title="Help & docs" eyebrow="Workflow guide" description="A small safety net for the core LaunchRelay workflow.">
      <div className="w-full space-y-5">
        <SectionCard title="Workflow in 5 steps" description="Use this when you need to recover the next step.">
          <DataTable columns={["Step", "What it is for"]} rows={guideRows} empty="Guide unavailable." />
        </SectionCard>
        <SectionCard title="Need to recover?" description="Use the main workflow screens instead of learning a second interface.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button onClick={() => goApp("sources")} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Sources</Button>
            <Button onClick={() => goApp("review")} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Moments</Button>
            <Button onClick={() => goApp("draft")} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Studio</Button>
            <Button onClick={() => goApp("library")} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Library</Button>
          </div>
        </SectionCard>
      </div>
    </Page>
  );
}

function SettingsScreen({ workspace, currentUser, demoMode, onLogout, githubRepoInput, activities }) {
  return (
    <Page title="Settings">
      <div className="space-y-5">
        <SettingsCard title="Profile">
          <SettingsRow label="Name" value={currentUser?.full_name || currentUser?.name || workspace.name || "Not set"} action="Edit Profile" />
          <SettingsRow label="Email" value={currentUser?.email || (demoMode ? "Demo workspace" : "Not set")} />
        </SettingsCard>

        <SettingsCard title="Connected Sources">
          <SettingsRow label="GitHub" value={githubRepoInput || workspace.primary_repo_url ? "Connected" : "Not Connected"} action={githubRepoInput || workspace.primary_repo_url ? "Manage →" : "Connect →"} />
          <SettingsRow label="Notion" value="Not Connected" action="Connect →" />
          <SettingsRow label="Linear" value="Not Connected" action="Connect →" />
          <SettingsRow label="Manual Uploads" value={activities.length ? "Available" : "Available"} action="Upload →" />
        </SettingsCard>

        <SettingsCard title="AI Preferences">
          <SettingsRow label="Automatically detect new Highlights" value="ON" />
          <SettingsRow label="Notify me when new Highlights are found" value="OFF" />
        </SettingsCard>

        <SettingsCard title="Publishing">
          <SettingsRow label="LinkedIn" value="Not Connected" action="Connect →" />
          <SettingsRow label="X" value="Not Connected" action="Connect →" />
          <SettingsRow label="Website" value="Coming Soon" />
        </SettingsCard>

        <SettingsCard title="Workspace">
          <SettingsRow label="Theme" value="System" action="Change →" />
          <SettingsRow label="Start on" value="Workspace" action="Change →" />
        </SettingsCard>

        <SettingsCard title="Notifications">
          <SettingsRow label="Highlight notifications" value="ON" />
          <SettingsRow label="Weekly summary" value="OFF" />
          <SettingsRow label="Product updates" value="ON" />
        </SettingsCard>

        <SettingsCard title="Account">
          <SettingsRow label="Plan" value="Free" />
          <SettingsRow label="Billing" value="Not connected" action="Manage Subscription →" />
          <button onClick={onLogout} className="mt-2 flex w-full items-center justify-between rounded-2xl border border-[var(--lr-border)] bg-white px-4 py-3 text-left text-sm font-medium text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">
            <span>Sign Out</span>
            <ArrowRight className="h-4 w-4 text-[var(--lr-muted)]" />
          </button>
        </SettingsCard>
      </div>
    </Page>
  );
}

function SettingsCard({ title, children }) {
  return <section className="rounded-3xl border border-[var(--lr-border)] bg-white p-5 shadow-sm"><h2 className="mb-3 text-[17px] font-semibold tracking-[-0.018em] text-[var(--lr-text)]">{title}</h2><div className="divide-y divide-[var(--lr-border)]">{children}</div></section>;
}

function SettingsRow({ label, value, action }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-[var(--lr-text)]">{label}</div>
        <div className="mt-1 text-sm text-[var(--lr-text-2)]">{value}</div>
      </div>
      {action && <button type="button" className="text-left text-sm font-medium text-[var(--lr-orange)] sm:text-right">{action}</button>}
    </div>
  );
}

function SourceSetupFlow({ workspace, setWorkspace, onSave, sourceTab, setSourceTab, activityText, setActivityText, manualNotes, setManualNotes, githubRepoInput, setGithubRepoInput, activities, importPhase, isBusy, onImport, onGitHubImport, onDetect }) {
  const currentStep = sourceTab === "profile" ? "profile" : sourceTab === "continue" ? "continue" : activities.length > 0 && sourceTab === "context" ? "continue" : sourceTab === "context" ? "profile" : "activity";
  return (
    <div className="w-full space-y-5">
      <SourceStepIndicator currentStep={currentStep} setSourceTab={setSourceTab} activities={activities} />
      {currentStep === "profile" && <ProductProfileStep workspace={workspace} setWorkspace={setWorkspace} onSave={onSave} isBusy={isBusy} onNext={() => setSourceTab("connections")} />}
      {currentStep === "activity" && <SourceActivityStep githubRepoInput={githubRepoInput} setGithubRepoInput={setGithubRepoInput} importPhase={importPhase} isBusy={isBusy} onGitHubImport={onGitHubImport} activityText={activityText} setActivityText={setActivityText} manualNotes={manualNotes} setManualNotes={setManualNotes} activities={activities} onImport={onImport} />}
      {activities.length > 0 && currentStep === "continue" && <ContinueToMomentsStep activities={activities} onDetect={onDetect} isBusy={isBusy} onAddMore={() => setSourceTab("connections")} />}
    </div>
  );
}

function SourceStepIndicator({ currentStep, setSourceTab, activities }) {
  const steps = [
    ["profile", "Step 1: Product Profile", () => setSourceTab("profile")],
    ["activity", "Step 2: Add Source Activity", () => setSourceTab("connections")],
    ["continue", "Step 3: Continue to Launch Moments", () => activities.length > 0 && setSourceTab("continue")],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {steps.map(([id, label, onClick]) => <button key={id} type="button" onClick={onClick} className={`rounded-2xl border px-4 py-3 text-left text-sm ${currentStep === id ? "border-[var(--lr-orange)] bg-[var(--lr-orange-tint)] font-semibold text-[var(--lr-orange)]" : "border-[var(--lr-border)] bg-white text-[var(--lr-text-2)]"}`}>{label}</button>)}
    </div>
  );
}

function ProductProfileStep({ workspace, setWorkspace, onSave, isBusy, onNext }) {
  const fields = [
    ["name", "Product name", "What product is this?"],
    ["description", "One-sentence description", "What does it help people do?"],
    ["target_audience", "Audience", "Who should the education help?"],
    ["primary_repo_url", "Primary repository", "Public GitHub URL or owner/repo."],
  ];
  return (
    <SectionCard title="Step 1: Product Profile" description="Tell LaunchRelay what product this is before adding source activity.">
      <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label, help]) => <Field key={key} label={label} help={help} value={workspace[key]} onChange={(value) => setWorkspace({ ...workspace, [key]: value })} />)}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Save product profile</Button>
        <Button type="button" onClick={onNext} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Add source activity</Button>
      </div>
    </SectionCard>
  );
}

function SourceActivityStep({ githubRepoInput, setGithubRepoInput, importPhase, isBusy, onGitHubImport, activityText, setActivityText, manualNotes, setManualNotes, activities, onImport }) {
  return (
    <SectionCard title="Step 2: Add Source Activity" description="Choose one way to add activity. GitHub and manual notes feed the same source trail.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4">
          <h3 className="font-semibold text-[var(--lr-text)]">GitHub repository</h3>
          <Field label="Repository URL or owner/repo" help="Public GitHub URL or owner/repo." value={githubRepoInput} onChange={setGithubRepoInput} />
          <Button onClick={onGitHubImport} disabled={isBusy} className="mt-4 rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Import GitHub activity</Button>
          <ImportProgress phase={importPhase} />
        </div>
        <div className="rounded-2xl border border-[var(--lr-border)] bg-white p-4">
          <h3 className="font-semibold text-[var(--lr-text)]">Manual notes</h3>
          <ManualNotesPanel activityText={activityText} setActivityText={setActivityText} manualNotes={manualNotes} setManualNotes={setManualNotes} activities={activities} isBusy={isBusy} onImport={onImport} compact />
        </div>
      </div>
      <ActivityDetailsDisclosure activities={activities} />
    </SectionCard>
  );
}

function ContinueToMomentsStep({ activities, onDetect, isBusy, onAddMore }) {
  return (
    <SectionCard title="Step 3: Continue to Launch Moments" description="Source activity exists. Now detect launch moments from it.">
      <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm text-[var(--lr-text-2)]">{activities.length} source records are ready.</div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onDetect} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Detect launch moments</Button>
        <Button type="button" onClick={onAddMore} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Add more activity</Button>
      </div>
      <ActivityDetailsDisclosure activities={activities} />
    </SectionCard>
  );
}

function ActivityDetailsDisclosure({ activities }) {
  if (!activities.length) return null;
  return (
    <details className="mt-5 rounded-2xl border border-[var(--lr-border)] bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--lr-text)]">View imported activity</summary>
      <div className="mt-4"><ActivityList activities={activities} /></div>
    </details>
  );
}

function ProductContextForm({ workspace, setWorkspace, onSave, isBusy, settingsMode = false }) {
  const essentialFields = [
    ["name", "Product name", "The product LaunchRelay should understand and explain."],
    ["description", "Product description", "One clear sentence about what the product helps users do."],
    ["target_audience", "Audience", "Who the launch story should be useful for."],
    ["primary_repo_url", "Primary repository", "Public repo or owner/repo used for source activity import."],
    ["primary_channels", "Channels", "Where the final education work will usually appear."],
    ["product_stage", "Stage", "MVP, beta, mature product, or another operating stage."],
  ];
  return (
    <SectionCard title={settingsMode ? "General workspace details" : "Product context"} description="These inputs shape what LaunchRelay considers launch-worthy, how it explains value, and which terminology it should preserve.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4">
            <h3 className="text-sm font-semibold text-[var(--lr-text)]">Essential context</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--lr-text-2)]">The minimum product truth needed before importing source activity.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">{essentialFields.map(([key, label, help]) => <Field key={key} label={label} help={help} value={workspace[key]} onChange={(value) => setWorkspace({ ...workspace, [key]: value })} />)}</div>
          </div>
          <div className="rounded-2xl border border-[var(--lr-border)] bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--lr-text)]">Voice and positioning</h3>
            <TextArea label="Positioning" help="The strategic angle LaunchRelay should protect when turning shipped work into education." value={workspace.positioning_notes} onChange={(value) => setWorkspace({ ...workspace, positioning_notes: value })} />
            <div className="grid gap-4 md:grid-cols-2">
              <TextArea label="Terminology" help="Words and concepts the product should consistently use or avoid." value={workspace.terminology_notes} onChange={(value) => setWorkspace({ ...workspace, terminology_notes: value })} />
              <TextArea label="Style guidance" help="Tone rules for drafts, such as practical, non-hypey, beginner-friendly, or technical." value={workspace.style_guidance} onChange={(value) => setWorkspace({ ...workspace, style_guidance: value })} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-orange-tint)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
          <div className="text-sm font-semibold text-[var(--lr-text)]">Why this matters</div>
          <p className="mt-2">Source receipts are only useful when LaunchRelay knows the product, audience, channels, and voice they should serve.</p>
          <p className="mt-3">Save context first, then import evidence. This keeps launch moments practical instead of generic.</p>
        </div>
      </div>
      <Button onClick={onSave} disabled={isBusy} className="mt-5 rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Save product context</Button>
    </SectionCard>
  );
}

function ConnectionsPanel({ githubRepoInput, setGithubRepoInput, activities, importPhase, isBusy, onGitHubImport, onDetect }) {
  return (
    <SectionCard title="Source connection card" description="Import public GitHub activity first; detection appears only after receipts exist.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <Field label="Repository URL or owner/repo" help="Paste a public GitHub URL or owner/repo. Private repo OAuth can come later." value={githubRepoInput} onChange={setGithubRepoInput} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onGitHubImport} disabled={isBusy} className="rounded-xl bg-[var(--lr-blue)] text-white shadow-none hover:bg-[#3554d1]">Import activity</Button>
            {activities.length > 0 && <Button onClick={onDetect} disabled={isBusy} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Detect launch moments</Button>}
          </div>
          <ImportProgress phase={importPhase} />
        </div>
        <div className="rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
          <div className="font-semibold text-[var(--lr-text)]">Import timeline</div>
          <p className="mt-2">Import creates source receipts. Detection is intentionally secondary so users do not skip evidence setup.</p>
          <div className="mt-3 rounded-xl bg-white p-3"><strong className="text-[var(--lr-text)]">Fallback:</strong> use Manual notes for private work, release notes, or customer context.</div>
        </div>
      </div>
    </SectionCard>
  );
}

function ManualNotesPanel({ activityText, setActivityText, manualNotes, setManualNotes, activities, isBusy, onImport, compact = false }) {
  function updateNote(id, body) {
    const nextNotes = manualNotes.map((note) => note.id === id ? { ...note, body } : note);
    setManualNotes(nextNotes);
    setActivityText(compileManualNotes(nextNotes, activityText));
  }
  function addNote() {
    const nextNotes = [...manualNotes, { id: `note_${Date.now()}`, body: "" }];
    setManualNotes(nextNotes);
  }
  function removeNote(id) {
    const nextNotes = manualNotes.length > 1 ? manualNotes.filter((note) => note.id !== id) : manualNotes;
    setManualNotes(nextNotes);
    setActivityText(compileManualNotes(nextNotes, activityText));
  }
  const content = (
    <>
      {!compact && <div className="mb-4 rounded-2xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-4 text-sm leading-6 text-[var(--lr-text-2)]">
        Accepted formats: PR notes, commit notes, release notes, customer/product notes, and short shipped-work observations.
      </div>}
      <div className="space-y-3">
        {manualNotes.map((note, index) => <NoteBlock key={note.id} note={note} index={index} onChange={updateNote} onRemove={removeNote} canRemove={manualNotes.length > 1} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={addNote} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Add another note</Button>
        <Button onClick={onImport} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Normalize notes</Button>
        <span className="text-sm text-[var(--lr-text-2)]">{activities.length ? `${activities.length} source records currently available.` : "No records imported yet."}</span>
      </div>
    </>
  );
  if (compact) return <div className="mt-4">{content}</div>;
  return (
    <SectionCard title="Manual notes" description="Add separate shipped-work notes. LaunchRelay normalizes them together while keeping them written separately.">
      {content}
    </SectionCard>
  );
}

function NoteBlock({ note, index, onChange, onRemove, canRemove }) {
  return (
    <div className="rounded-2xl border border-[var(--lr-border)] bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[var(--lr-text)]">Note {index + 1}</div>
        {canRemove && <button type="button" onClick={() => onRemove(note.id)} className="text-xs font-medium text-[var(--lr-muted)] hover:text-[var(--lr-text)]">Remove</button>}
      </div>
      <textarea aria-label={`Manual note ${index + 1}`} rows={4} value={note.body} onChange={(event) => onChange(note.id, event.target.value)} className="w-full rounded-xl border border-[var(--lr-border)] bg-[var(--lr-canvas)] p-3 text-sm leading-6 text-[var(--lr-text)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--lr-orange)]" placeholder="PR: added onboarding checklist..." />
    </div>
  );
}

function ActivityList({ activities }) {
  if (!activities.length) return <EmptyState icon={GitBranch} title="No activity yet" body="Import a repository or add shipped-work notes to create source receipts." />;
  return <div className="grid gap-2">{activities.slice(0, 8).map((item) => <SourceReceiptTooltip key={item.id || item.title} item={item} />)}</div>;
}

function SourceReceiptTooltip({ item }) {
  const sourceLabel = sourceTypeLabel(item.source_type);
  return (
    <div className="group relative">
      <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--lr-border)] bg-white px-3 py-2 text-left text-sm transition hover:border-[var(--lr-blue)] focus:border-[var(--lr-blue)]">
        <span className="min-w-0 truncate font-medium text-[var(--lr-text)]">{item.title}</span>
        <span className="shrink-0 text-xs text-[var(--lr-blue)]">View receipt</span>
      </button>
      <div className="invisible absolute right-0 top-[calc(100%+8px)] z-20 w-80 rounded-2xl border border-[var(--lr-border)] bg-white p-4 opacity-0 shadow-[var(--lr-shadow)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="blue">{sourceLabel}</Badge>
          {item.product_area && <Badge tone="orange">{item.product_area}</Badge>}
          {item.occurred_at && <span className="text-[var(--lr-muted)]">{formatDate(item.occurred_at)}</span>}
        </div>
        <div className="font-semibold leading-snug text-[var(--lr-text)]">{item.title}</div>
        <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">{item.impact_hint || item.body}</p>
        {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--lr-blue)] underline-offset-4 hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </div>
  );
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

function HighlightReview({ cluster, sources, onContinue }) {
  const visibleEvidence = sources.slice(0, 4);
  const moreEvidenceCount = Math.max(0, sources.length - visibleEvidence.length);
  if (!cluster) {
    return (
      <div className="mx-auto max-w-[960px] py-8">
        <EmptyState icon={CircleDot} eyebrow="Highlight" title="No Highlight selected" body="Choose an improvement from Workspace to review it here." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[960px] py-8">
      <article className="rounded-[28px] border border-[var(--lr-border)] bg-white p-6 shadow-[var(--lr-shadow-tight)] md:p-8">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--lr-muted)]">Highlight</div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--lr-text)] md:text-4xl">{cluster.title}</h1>

        <section className="mt-8 rounded-2xl bg-[var(--lr-orange-tint)] p-5">
          <div className="text-sm font-semibold text-[var(--lr-text)]">Why it matters</div>
          <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.user_value || cluster.why_it_matters}</p>
        </section>

        <section className="mt-8">
          <p className="text-base leading-7 text-[var(--lr-text-2)]">{cluster.summary}</p>
        </section>

        <section className="mt-8">
          <div className="text-sm font-semibold text-[var(--lr-text)]">Based on</div>
          <div className="mt-4 space-y-3">
            {visibleEvidence.length ? visibleEvidence.map((item) => <SourceReceipt key={item.id || item.title} item={item} compact />) : <p className="text-sm text-[var(--lr-muted)]">No evidence is linked to this Highlight yet.</p>}
            {moreEvidenceCount > 0 && <div className="rounded-2xl border border-dashed border-[var(--lr-border)] bg-[var(--lr-canvas)] px-4 py-3 text-sm font-medium text-[var(--lr-muted)]">+{moreEvidenceCount} more</div>}
          </div>
        </section>

        <Button onClick={() => onContinue(cluster)} className="mt-8 rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Continue to Draft →</Button>
      </article>
    </div>
  );
}

function DraftHighlightContext({ cluster, sourceItems }) {
  const visibleEvidence = sourceItems.slice(0, 4);
  const moreEvidenceCount = Math.max(0, sourceItems.length - visibleEvidence.length);
  return (
    <section className="rounded-[28px] border border-[var(--lr-border)] bg-white p-6 shadow-[var(--lr-shadow-tight)] md:p-8">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--lr-muted)]">Highlight</div>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--lr-text)]">{cluster.title}</h2>
      <div className="mt-5 rounded-2xl bg-[var(--lr-orange-tint)] p-5">
        <div className="text-sm font-semibold text-[var(--lr-text)]">Why it matters</div>
        <p className="mt-2 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.user_value || cluster.why_it_matters}</p>
      </div>
      <div className="mt-8">
        <div className="text-sm font-semibold text-[var(--lr-text)]">Based on</div>
        <div className="mt-4 space-y-3">
          {visibleEvidence.length ? visibleEvidence.map((item) => <SourceReceipt key={item.id || item.title} item={item} compact />) : <p className="text-sm text-[var(--lr-muted)]">No evidence is linked to this Highlight yet.</p>}
          {moreEvidenceCount > 0 && <div className="rounded-2xl border border-dashed border-[var(--lr-border)] bg-[var(--lr-canvas)] px-4 py-3 text-sm font-medium text-[var(--lr-muted)]">+{moreEvidenceCount} more</div>}
        </div>
      </div>
    </section>
  );
}

function StoryEditorWorkspace({ draft, setDraft, onSaveDraft, onPublishDraft, onCreateDraft, isBusy }) {
  const [autoSaveLabel, setAutoSaveLabel] = useState("Saved");

  function updateDraft(field, value) {
    setDraft({ ...draft, [field]: value, updated_at: new Date().toISOString() });
    setAutoSaveLabel("Saving...");
    window.setTimeout(() => setAutoSaveLabel("Saved"), 650);
  }

  return (
    <section className="rounded-[28px] border border-[var(--lr-border)] bg-white p-6 shadow-[var(--lr-shadow-tight)] md:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--lr-muted)]">Draft Editor</div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--lr-text)]">Draft</h2>
        </div>
        {draft && <span className="rounded-full bg-[var(--lr-canvas)] px-3 py-1 text-xs font-medium text-[var(--lr-muted)]">{autoSaveLabel}</span>}
      </div>
      {draft ? (
        <div className="space-y-4">
          <Input aria-label="Draft title" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} className="h-12 rounded-xl border-[var(--lr-border)] bg-white text-lg font-semibold text-[var(--lr-text)]" />
          <textarea aria-label="Draft body" value={draft.body} onChange={(event) => updateDraft("body", event.target.value)} className="min-h-[560px] w-full rounded-2xl border border-[var(--lr-border)] bg-white p-5 text-sm leading-7 text-[var(--lr-text)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--lr-orange)]" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={onPublishDraft} disabled={isBusy} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Publish</Button>
            <Button onClick={onSaveDraft} disabled={isBusy} variant="ghost" className="rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Save Draft</Button>
          </div>
        </div>
      ) : (
        <EmptyState icon={FileText} eyebrow="Draft from Highlight" title="No draft yet" body="Create a first draft from this reviewed Highlight, then edit it here." actionLabel="Create Draft" onAction={onCreateDraft} disabled={isBusy} />
      )}
    </section>
  );
}

function OpportunityCard({ item, onSave }) {
  return (
    <article className="rounded-2xl border border-[var(--lr-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge tone={item.status === "saved" ? "green" : "orange"}>{item.status === "saved" ? "Saved" : item.format || "Idea"}</Badge>
          <h3 className="mt-3 font-semibold tracking-[-0.01em] text-[var(--lr-text)]">{item.title}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--lr-text-2)]">{item.summary || item.angle || item.why_it_matters}</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <InfoLine label="Audience" value={item.audience || "Product education"} />
        <InfoLine label="Why it matters" value={item.why_it_matters} />
      </dl>
      <div className="mt-5">
        <Button onClick={onSave} disabled={item.status === "saved"} className="rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">{item.status === "saved" ? "Saved" : "Save idea"}</Button>
      </div>
    </article>
  );
}

function DraftLibraryCard({ draft, onDraft }) {
  return (
    <article className="rounded-2xl border border-[var(--lr-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold tracking-[-0.01em] text-[var(--lr-text)]">{draft.title || "Untitled draft"}</h3>
        <Badge tone="blue">Draft</Badge>
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--lr-muted)]">Last edited</div>
      <p className="mt-1 text-sm text-[var(--lr-text-2)]">{formatRelativeDate(draft.updated_at || draft.created_at)}</p>
      <Button onClick={onDraft} variant="ghost" className="mt-5 rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">Continue Editing →</Button>
    </article>
  );
}

function SuggestedHighlightCard({ cluster, activities, onReview }) {
  const sources = getSourcesForCluster(cluster, activities);
  return (
    <article className="rounded-2xl border border-[var(--lr-border)] bg-white p-5 shadow-sm">
      <h3 className="font-semibold tracking-[-0.01em] text-[var(--lr-text)]">{cluster.title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--lr-text-2)]">{cluster.why_it_matters || cluster.user_value || cluster.summary}</p>
      <p className="mt-4 text-sm font-medium text-[var(--lr-muted)]">Based on {cluster.activity_item_ids?.length || sources.length || 0} sources</p>
      <Button onClick={() => onReview(cluster)} className="mt-5 rounded-xl bg-[var(--lr-orange)] text-white shadow-none hover:bg-[#d95a2e]">Review Highlight →</Button>
    </article>
  );
}

function PublishedCard({ draft }) {
  return (
    <article className="rounded-2xl border border-[var(--lr-border)] bg-white p-5 shadow-sm">
      <h3 className="font-semibold tracking-[-0.01em] text-[var(--lr-text)]">{draft.title || "Published content"}</h3>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--lr-muted)]">Published</div>
      <p className="mt-1 text-sm text-[var(--lr-text-2)]">{formatRelativeDate(draft.updated_at || draft.created_at)}</p>
      <div className="mt-4"><Badge tone="green">Published</Badge></div>
      <Button variant="ghost" className="mt-5 rounded-xl border border-[var(--lr-border)] bg-white text-[var(--lr-text)] hover:bg-[var(--lr-surface-2)]">View →</Button>
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

function ChecklistStep({ step, active }) {
  const stateClass = step.state === "Done" ? "bg-[var(--lr-green)]" : active ? "bg-[var(--lr-orange)]" : "bg-[var(--lr-muted)]";
  return <div className="flex items-start gap-3"><span className={`mt-1 flex h-2.5 w-2.5 rounded-full ${stateClass}`} /><div><div className="text-sm font-medium text-[var(--lr-text)]">{step.label}</div><div className="text-xs text-[var(--lr-muted)]">{step.state}</div></div></div>;
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
    workspace: "Workspace",
    review: "Review",
    draft: "Draft",
    library: "Library",
    settings: "Settings",
    sources: "Workspace",
    opportunities: "Library",
    help: "Workspace",
  };
  return labels[normalizeAppRoute(view)] || labels[view] || "Workspace";
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

function sameOpportunity(left, right) {
  if (left.id && right.id) return left.id === right.id;
  return left.title === right.title && left.format === right.format;
}

function compileManualNotes(manualNotes = [], fallbackText = "") {
  const noteText = manualNotes.map((note) => note.body.trim()).filter(Boolean).join("\n");
  return noteText || fallbackText;
}


function initialViewFromLocation() {
  if (typeof window === "undefined") return "public-home";
  const hashRoute = extractHashRoute(window.location.hash);
  if (appRouteIds.includes(hashRoute)) return normalizeAppRoute(hashRoute);
  if (publicRouteIds.includes(hashRoute)) return hashRoute;
  return "public-home";
}

function normalizeAppRoute(view) {
  return legacyRouteAliases[view] || view;
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

export const __qa = {
  LibraryScreen,
  SettingsScreen,
};
