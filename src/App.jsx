import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  FileText,
  GitBranch,
  Library,
  Lightbulb,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  createManualActivityItemsFromText,
  createGitHubActivityItemsFromPayloads,
  parseGitHubRepoInput,
  generateDeterministicLaunchClusters,
  generateDeterministicOpportunities,
} from "@/core/launchrelay-core.mjs";

const ProductWorkspace = base44.entities.ProductWorkspace;
const ActivityItem = base44.entities.ActivityItem;
const SourceConnection = base44.entities.SourceConnection;
const LaunchCluster = base44.entities.LaunchCluster;
const Draft = base44.entities.Draft;
const Opportunity = base44.entities.Opportunity;

const steps = [
  "Landing",
  "Project Setup",
  "Import + Timeline",
  "Launch Review",
  "Story Studio",
  "Library",
];

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

export default function App() {
  const [screen, setScreen] = useState(0);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [workspaceRecord, setWorkspaceRecord] = useState(null);
  const [activityText, setActivityText] = useState(sampleActivity);
  const [githubRepoInput, setGithubRepoInput] = useState(initialWorkspace.primary_repo_url);
  const [activities, setActivities] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [draft, setDraft] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [activeStudioTab, setActiveStudioTab] = useState("draft");
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("Ready to build a source-grounded launch workflow.");

  const acceptedCluster = useMemo(
    () => clusters.find((cluster) => cluster.status === "accepted" || cluster.status === "edited") || selectedCluster,
    [clusters, selectedCluster]
  );

  async function saveWorkspace() {
    setIsBusy(true);
    try {
      const record = workspaceRecord
        ? await ProductWorkspace.update(workspaceRecord.id, workspace)
        : await ProductWorkspace.create(workspace);
      setWorkspaceRecord(record);
      setStatus("Workspace context saved to Base44 entities.");
      setScreen(2);
    } catch (error) {
      console.error(error);
      setStatus("Could not save to Base44 yet. Continuing locally so the workflow remains demo-safe.");
      setWorkspaceRecord({ id: "local_workspace", ...workspace });
      setScreen(2);
    } finally {
      setIsBusy(false);
    }
  }

  async function importManualActivity() {
    setIsBusy(true);
    const workspaceId = workspaceRecord?.id || "local_workspace";
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
      setStatus(`Backend normalizeActivity imported ${saved.length} activity items into Base44 entities.`);
    } catch (error) {
      console.error(error);
      const normalized = createManualActivityItemsFromText(activityText, {
        workspaceId,
        importedAt,
        idPrefix: "local_activity",
      });
      setActivities(normalized.map((item, index) => ({ ...item, id: item.id || `local_activity_${index + 1}` })));
      setStatus("Backend normalizeActivity was unavailable, so manual import used local deterministic fallback.");
    } finally {
      setIsBusy(false);
    }
  }

  async function importGitHubActivity() {
    setIsBusy(true);
    const workspaceId = workspaceRecord?.id || "local_workspace";
    const importedAt = new Date().toISOString();
    const parsed = parseGitHubRepoInput(githubRepoInput);

    if (!parsed.isValid) {
      setStatus(parsed.error);
      setIsBusy(false);
      return;
    }

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

      const response = await base44.functions.invoke("importPublicGitHubActivity", {
        repoInput: githubRepoInput,
        workspaceId,
        sourceConnectionId,
        importedAt,
      });
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
      setStatus(`Imported ${saved.length} new GitHub activities from ${parsed.repoOwner}/${parsed.repoName} through the backend import function.`);
    } catch (error) {
      console.error(error);
      try {
        const githubPayloads = await fetchPublicGitHubPayloads(parsed.repoOwner, parsed.repoName);
        const imported = createGitHubActivityItemsFromPayloads(githubPayloads, {
          workspaceId,
          sourceConnectionId: null,
          repoOwner: parsed.repoOwner,
          repoName: parsed.repoName,
          importedAt,
        });
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
        setStatus(`Imported ${saved.length} new GitHub activities from ${parsed.repoOwner}/${parsed.repoName}. Backend import was unavailable, so LaunchRelay used the browser GitHub fetch fallback.`);
      } catch (fallbackError) {
        console.error(fallbackError);
        setStatus("Public GitHub import could not complete. Manual paste remains available as the reliable fallback.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function detectLaunchMoments() {
    if (!activities.length) {
      setStatus("Import or paste activity first.");
      return;
    }
    setIsBusy(true);
    const workspaceId = workspaceRecord?.id || "local_workspace";

    try {
      const response = await base44.functions.invoke("detectLaunchMoments", {
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
      setStatus("Backend detectLaunchMoments created a source-linked launch cluster and saved it to Base44.");
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
      setStatus("Backend detectLaunchMoments was unavailable, so launch detection used local deterministic fallback.");
    } finally {
      setIsBusy(false);
    }
  }

  async function acceptCluster(cluster) {
    const updated = { ...cluster, status: "accepted" };
    setSelectedCluster(updated);
    setClusters((items) => items.map((item) => (item.id === cluster.id ? updated : item)));
    try {
      if (!String(cluster.id).startsWith("local_")) await LaunchCluster.update(cluster.id, { status: "accepted" });
      setStatus("Human review complete: cluster accepted for story coproduction.");
    } catch (error) {
      console.error(error);
      setStatus("Cluster accepted locally. Base44 update can be retried later.");
    }
    setScreen(4);
  }

  async function createDraft() {
    if (!acceptedCluster) return;
    setIsBusy(true);
    const sourceTitles = activities
      .filter((item) => acceptedCluster.activity_item_ids?.includes(item.id))
      .map((item) => item.title);
    const body = `# ${acceptedCluster.title}\n\n${workspace.name} recently shipped a set of related changes that point to a clear product education moment.\n\n## What changed\n${sourceTitles.map((title) => `- ${title}`).join("\n")}\n\n## Why it matters\n${acceptedCluster.why_it_matters}\n\n## User value\n${acceptedCluster.user_value}\n\n## Suggested launch framing\nThis is not just a list of shipped changes. It is a story about helping ${workspace.target_audience} understand and use the product more effectively.\n\n## Sources used\n${sourceTitles.map((title) => `- ${title}`).join("\n")}`;
    const draftPayload = {
      workspace_id: workspaceRecord?.id || "local_workspace",
      launch_cluster_id: acceptedCluster.id,
      draft_type: "feature_launch",
      title: acceptedCluster.title,
      body,
      status: "draft",
      source_summary: `Generated from ${sourceTitles.length} accepted source activities.`,
      generation_inputs_snapshot: JSON.stringify({ workspace, cluster: acceptedCluster, sourceTitles }),
      source_activity_item_ids: acceptedCluster.activity_item_ids || [],
    };

    try {
      const saved = await Draft.create(draftPayload);
      setDraft(saved);
      setStatus("Story draft saved to Base44 Draft entity.");
    } catch (error) {
      console.error(error);
      setDraft({ ...draftPayload, id: "local_draft_1" });
      setStatus("Draft generated with deterministic fallback and stored locally for this session.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createOpportunities() {
    if (!acceptedCluster) return;
    setIsBusy(true);
    const workspaceId = workspaceRecord?.id || "local_workspace";

    try {
      const response = await base44.functions.invoke("expandOpportunities", {
        cluster: acceptedCluster,
        workspaceId,
      });
      const generated = response.data.opportunities || [];
      const saved = [];
      for (const opportunity of generated) saved.push(await Opportunity.create(opportunity));
      setOpportunities(saved);
      setStatus("Backend expandOpportunities saved five follow-up education opportunities.");
    } catch (error) {
      console.error(error);
      const generated = generateDeterministicOpportunities(acceptedCluster, { workspaceId });
      setOpportunities(generated.map((item, index) => ({ ...item, id: `local_opportunity_${index + 1}` })));
      setStatus("Backend expandOpportunities was unavailable, so opportunities used local deterministic fallback.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveOpportunity(opportunity) {
    const updated = { ...opportunity, status: "saved" };
    setOpportunities((items) => items.map((item) => (item.id === opportunity.id ? updated : item)));
    try {
      if (!String(opportunity.id).startsWith("local_")) await Opportunity.update(opportunity.id, { status: "saved" });
      setStatus("Opportunity saved to library.");
    } catch (error) {
      console.error(error);
      setStatus("Opportunity saved locally for this session.");
    }
  }

  return (
    <div className="min-h-screen bg-[#080B12] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.22),_transparent_36%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.16),_transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-5 py-6">
        <Header screen={screen} setScreen={setScreen} />
        <StepNav screen={screen} setScreen={setScreen} />
        <StatusBar status={status} isBusy={isBusy} />

        {screen === 0 && <Landing onStart={() => setScreen(1)} onSample={() => { setWorkspaceRecord({ id: "local_workspace", ...workspace }); setScreen(2); }} />}
        {screen === 1 && <ProjectSetup workspace={workspace} setWorkspace={setWorkspace} onSave={saveWorkspace} isBusy={isBusy} />}
        {screen === 2 && <ImportTimeline activityText={activityText} setActivityText={setActivityText} githubRepoInput={githubRepoInput} setGithubRepoInput={setGithubRepoInput} activities={activities} onImport={importManualActivity} onGitHubImport={importGitHubActivity} onDetect={detectLaunchMoments} isBusy={isBusy} />}
        {screen === 3 && <LaunchReview clusters={clusters} activities={activities} selectedCluster={selectedCluster} setSelectedCluster={setSelectedCluster} onAccept={acceptCluster} onDetect={detectLaunchMoments} />}
        {screen === 4 && <StoryStudio activeTab={activeStudioTab} setActiveTab={setActiveStudioTab} cluster={acceptedCluster} activities={activities} draft={draft} setDraft={setDraft} opportunities={opportunities} onCreateDraft={createDraft} onCreateOpportunities={createOpportunities} onSaveOpportunity={saveOpportunity} isBusy={isBusy} />}
        {screen === 5 && <DraftLibrary draft={draft} opportunities={opportunities} cluster={acceptedCluster} activities={activities} />}
      </div>
    </div>
  );
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

async function fetchGitHubJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Public GitHub repo not found. Private repos require a later OAuth connection.");
    throw new Error(`GitHub API request failed with ${response.status}.`);
  }
  return response.json();
}

function Header({ screen, setScreen }) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <button onClick={() => setScreen(0)} className="text-left">
        <div className="text-sm uppercase tracking-[0.32em] text-orange-300">LaunchRelay</div>
        <div className="text-xl font-semibold text-white">Product education from shipped work</div>
      </button>
      <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
        Backend-connected workflow · GitHub-first source import
      </div>
    </header>
  );
}

function StepNav({ screen, setScreen }) {
  return (
    <nav className="mb-6 grid gap-2 md:grid-cols-6">
      {steps.map((step, index) => (
        <button key={step} onClick={() => setScreen(index)} className={`rounded-2xl border px-3 py-3 text-left text-xs transition ${screen === index ? "border-orange-300 bg-orange-400/15 text-orange-100" : "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07]"}`}>
          <span className="block text-[10px] uppercase tracking-[0.2em]">0{index + 1}</span>
          <span className="font-medium">{step}</span>
        </button>
      ))}
    </nav>
  );
}

function StatusBar({ status, isBusy }) {
  return (
    <div className="mb-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
      {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-orange-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
      {status}
    </div>
  );
}

function Landing({ onStart, onSample }) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 shadow-2xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-orange-400/15 px-4 py-2 text-sm text-orange-100">
          <Sparkles className="h-4 w-4" /> Built for product education teams
        </div>
        <h1 className="mb-5 max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
          Turn every shipped feature into a product education moment.
        </h1>
        <p className="mb-8 max-w-2xl text-lg leading-8 text-slate-300">
          Connect product activity, detect launch-worthy change clusters, coproduce a source-grounded story, and reveal follow-up education opportunities.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={onStart} className="h-12 rounded-full bg-orange-400 px-6 text-slate-950 hover:bg-orange-300">Create workspace <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <Button onClick={onSample} variant="ghost" className="h-12 rounded-full border border-white/10 bg-white/5 px-6 text-white hover:bg-white/10">Try sample flow</Button>
        </div>
      </div>
      <div className="grid gap-4">
        <PromiseCard icon={GitBranch} title="Launch Detection" body="Cluster real shipped work into launch-worthy product education moments." />
        <PromiseCard icon={FileText} title="Story Coproduction" body="Turn accepted clusters into editable drafts that preserve source references." />
        <PromiseCard icon={Lightbulb} title="Opportunity Expansion" body="Reveal tutorials, FAQs, docs angles, and enablement ideas hidden inside one launch." />
      </div>
    </section>
  );
}

function PromiseCard({ icon: Icon, title, body }) {
  return <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6"><Icon className="mb-4 h-6 w-6 text-orange-300" /><h3 className="mb-2 text-xl font-semibold">{title}</h3><p className="text-slate-400">{body}</p></div>;
}

function ProjectSetup({ workspace, setWorkspace, onSave, isBusy }) {
  const fields = [
    ["name", "Product name"], ["description", "Product description"], ["target_audience", "Target audience"], ["product_stage", "Product stage"], ["primary_repo_url", "Primary repo URL"], ["primary_channels", "Primary channels"],
  ];
  return <Panel title="Project Setup" subtitle="Give the backend product context before any generation happens.">
    <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label]) => <Field key={key} label={label} value={workspace[key]} onChange={(value) => setWorkspace({ ...workspace, [key]: value })} />)}</div>
    <TextArea label="Positioning notes" value={workspace.positioning_notes} onChange={(value) => setWorkspace({ ...workspace, positioning_notes: value })} />
    <TextArea label="Terminology / style guidance" value={`${workspace.terminology_notes}\n${workspace.style_guidance}`} onChange={(value) => setWorkspace({ ...workspace, terminology_notes: value, style_guidance: value })} />
    <Button onClick={onSave} disabled={isBusy} className="mt-4 h-11 rounded-full bg-orange-400 px-6 text-slate-950 hover:bg-orange-300">Save workspace and import activity</Button>
  </Panel>;
}

function ImportTimeline({ activityText, setActivityText, githubRepoInput, setGithubRepoInput, activities, onImport, onGitHubImport, onDetect, isBusy }) {
  return <Panel title="Import + Activity Timeline" subtitle="Bring in real source material from a public GitHub repo or manual product notes.">
    <div className="rounded-3xl border border-blue-300/15 bg-blue-400/10 p-4">
      <Field label="Public GitHub repo" value={githubRepoInput} onChange={setGithubRepoInput} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={onGitHubImport} disabled={isBusy} className="rounded-full bg-blue-300 text-slate-950 hover:bg-blue-200">Import public GitHub activity</Button>
        <span className="text-xs text-blue-100/80">No OAuth required. Pulls, commits, and releases are normalized by a Base44 backend function.</span>
      </div>
    </div>
    <TextArea label="Or paste recent PRs, commits, release notes, or product context" value={activityText} onChange={setActivityText} rows={7} />
    <div className="mt-4 flex flex-wrap gap-3"><Button onClick={onImport} disabled={isBusy} className="rounded-full bg-orange-400 text-slate-950 hover:bg-orange-300">Import pasted activity</Button><Button onClick={onDetect} disabled={isBusy || !activities.length} variant="ghost" className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10">Detect launch moments</Button></div>
    <ActivityList activities={activities} />
  </Panel>;
}

function ActivityList({ activities }) {
  return <div className="mt-6 grid gap-3">{activities.length === 0 ? <Empty text="No activity yet. Import pasted activity to create traceable source records." /> : activities.map((item) => <div key={item.id || item.title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-blue-400/15 px-2 py-1 text-blue-200">{item.source_type}</span>{item.product_area && <span className="rounded-full bg-orange-400/15 px-2 py-1 text-orange-200">{item.product_area}</span>}</div><h4 className="font-semibold text-white">{item.title}</h4><p className="mt-1 text-sm text-slate-400">{item.impact_hint}</p></div>)}</div>;
}

function LaunchReview({ clusters, activities, selectedCluster, setSelectedCluster, onAccept, onDetect }) {
  return <Panel title="Launch Detection Review" subtitle="AI or fallback proposes clusters, but the human accepts and shapes the story.">
    {clusters.length === 0 ? <div><Empty text="No clusters yet. Run launch detection from your timeline." /><Button onClick={onDetect} className="mt-4 rounded-full bg-orange-400 text-slate-950 hover:bg-orange-300">Run launch detection</Button></div> : <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><div className="grid gap-3">{clusters.map((cluster) => <button key={cluster.id || cluster.title} onClick={() => setSelectedCluster(cluster)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.07]"><h4 className="font-semibold">{cluster.title}</h4><p className="mt-1 text-sm text-slate-400">{cluster.why_it_matters}</p><span className="mt-3 inline-flex rounded-full bg-emerald-400/15 px-2 py-1 text-xs text-emerald-200">{cluster.confidence_label} confidence</span></button>)}</div>{selectedCluster && <div className="rounded-3xl border border-orange-300/20 bg-orange-400/10 p-6"><h3 className="text-2xl font-semibold">{selectedCluster.title}</h3><p className="mt-3 text-slate-300">{selectedCluster.summary}</p><p className="mt-3 text-orange-100">{selectedCluster.user_value}</p><div className="mt-5"><h4 className="mb-2 font-semibold">Sources included</h4><ul className="space-y-2 text-sm text-slate-300">{activities.filter((item) => selectedCluster.activity_item_ids?.includes(item.id)).map((item) => <li key={item.id}>• {item.title}</li>)}</ul></div><Button onClick={() => onAccept(selectedCluster)} className="mt-6 rounded-full bg-orange-400 text-slate-950 hover:bg-orange-300">Accept and create story</Button></div>}</div>}
  </Panel>;
}

function StoryStudio({ activeTab, setActiveTab, cluster, activities, draft, setDraft, opportunities, onCreateDraft, onCreateOpportunities, onSaveOpportunity, isBusy }) {
  return <Panel title="Story Studio" subtitle="Draft the main story, then expand one launch moment into more education opportunities.">
    {!cluster ? <Empty text="Accept a launch cluster first." /> : <><div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4"><h3 className="font-semibold">Accepted cluster: {cluster.title}</h3><p className="mt-1 text-sm text-slate-400">{cluster.why_it_matters}</p></div><div className="mb-4 flex gap-2"><Tab active={activeTab === "draft"} onClick={() => setActiveTab("draft")}>Draft</Tab><Tab active={activeTab === "opportunities"} onClick={() => setActiveTab("opportunities")}>Opportunities</Tab></div>{activeTab === "draft" ? <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><div>{draft ? <><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mb-3 bg-white text-slate-950" /><textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className="min-h-[360px] w-full rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-100 outline-none" /></> : <Empty text="No draft yet. Generate from the accepted cluster." />}<Button onClick={onCreateDraft} disabled={isBusy} className="mt-4 rounded-full bg-orange-400 text-slate-950 hover:bg-orange-300">Generate source-grounded draft</Button></div><SourcePanel cluster={cluster} activities={activities} /></div> : <div><div className="mb-4 flex gap-3"><Button onClick={onCreateOpportunities} disabled={isBusy} className="rounded-full bg-orange-400 text-slate-950 hover:bg-orange-300">Find follow-up opportunities</Button></div><div className="grid gap-3 md:grid-cols-2">{opportunities.map((item) => <div key={item.id || item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="mb-2 text-xs uppercase tracking-[0.2em] text-orange-200">{item.format}</div><h4 className="font-semibold">{item.title}</h4><p className="mt-2 text-sm text-slate-400">{item.why_it_matters}</p><Button onClick={() => onSaveOpportunity(item)} variant="ghost" className="mt-4 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10">{item.status === "saved" ? "Saved" : "Save"}</Button></div>)}</div></div>}</>}
  </Panel>;
}

function DraftLibrary({ draft, opportunities, cluster, activities }) {
  const savedOpportunities = opportunities.filter((item) => item.status === "saved" || item.status === "promoted_to_draft");
  return <Panel title="Draft Library" subtitle="Saved stories and opportunities stay linked to the shipped work that created them.">
    <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><Library className="mb-3 h-6 w-6 text-orange-300" /><h3 className="text-xl font-semibold">Saved draft</h3>{draft ? <><h4 className="mt-4 font-semibold text-orange-100">{draft.title}</h4><p className="mt-2 text-sm text-slate-400">{draft.source_summary}</p><p className="mt-2 text-xs text-slate-500">Linked cluster: {cluster?.title}</p></> : <Empty text="No draft saved yet." />}</div><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><BookOpen className="mb-3 h-6 w-6 text-orange-300" /><h3 className="text-xl font-semibold">Saved opportunities</h3>{savedOpportunities.length ? savedOpportunities.map((item) => <p key={item.id || item.title} className="mt-3 rounded-2xl bg-slate-950/50 p-3 text-sm text-slate-300">{item.title}</p>) : <Empty text="No saved opportunities yet." />}</div></div><div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5"><Boxes className="mb-3 h-6 w-6 text-orange-300" /><h3 className="text-xl font-semibold">Traceability</h3><p className="mt-2 text-sm text-slate-400">{activities.length} source activities → {cluster ? 1 : 0} accepted cluster → {draft ? 1 : 0} draft → {savedOpportunities.length} saved opportunities.</p></div>
  </Panel>;
}

function SourcePanel({ cluster, activities }) {
  const sources = activities.filter((item) => cluster.activity_item_ids?.includes(item.id));
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h3 className="mb-3 font-semibold">Sources used</h3>{sources.map((item) => <div key={item.id} className="mb-3 rounded-2xl bg-slate-950/50 p-3"><div className="text-sm font-medium">{item.title}</div><div className="text-xs text-slate-500">{item.impact_hint}</div></div>)}</div>;
}

function Panel({ title, subtitle, children }) {
  return <section className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl"><h2 className="text-3xl font-semibold">{title}</h2><p className="mt-2 mb-6 text-slate-400">{subtitle}</p>{children}</section>;
}

function Field({ label, value, onChange }) {
  return <label className="block"><span className="mb-2 block text-sm text-slate-300">{label}</span><Input value={value || ""} onChange={(event) => onChange(event.target.value)} className="bg-white text-slate-950" /></label>;
}

function TextArea({ label, value, onChange, rows = 4 }) {
  return <label className="mt-4 block"><span className="mb-2 block text-sm text-slate-300">{label}</span><textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-100 outline-none focus:border-orange-300/50" /></label>;
}

function Tab({ active, onClick, children }) {
  return <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm ${active ? "bg-orange-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{children}</button>;
}

function Empty({ text }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-slate-400">{text}</div>;
}
