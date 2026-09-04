import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { preferredContentType } from './lib/contentType';
import { isExpired } from './lib/format';
import { useLocalStorage } from './lib/useLocalStorage';
import { ErrorNotice } from './components/Notice';
import { FetchPanel } from './components/FetchPanel';
import { PayloadPanel } from './components/PayloadPanel';
import { RunLog } from './components/RunLog';
import { TargetPanel } from './components/TargetPanel';
import { TokenPanel } from './components/TokenPanel';
import type {
  AppMetadataResponse,
  AppParty,
  CatalogueApp,
  DataElementInput,
  DataElementSummary,
  ExampleGroup,
  LocaltestStatus,
  LogResult,
  PublicToken,
  ReadDataElementResult,
  ReadInstanceResult,
  RunMode,
  RunResult,
  SavedApp,
  ServerConfig,
} from './types';

const EMPTY_ELEMENT: DataElementInput = { dataType: '', content: '' };

/** Accepts "510001/99d0632c-..." as well as a bare guid, so an instance id can be pasted whole. */
function splitPastedInstanceId(value: string): { partyId?: string; guid: string } {
  const match = /^(\d+)\/(.+)$/.exec(value.trim());
  if (match?.[1] && match[2]) return { partyId: match[1], guid: match[2].trim() };
  return { guid: value.trim() };
}

function logFromRun(result: RunResult): LogResult {
  const rows: { label: string; value: string }[] = [{ label: 'Mode', value: result.mode }];
  if (result.instanceOwnerPartyId) {
    rows.push({ label: 'Party', value: result.instanceOwnerPartyId });
  }
  if (result.instanceGuid) rows.push({ label: 'Instance', value: result.instanceGuid });
  return {
    ok: result.ok,
    steps: result.steps,
    failedAt: result.failedAt,
    title: 'Posted',
    rows,
    instanceUrl: result.instanceUrl,
  };
}

function logFromInstance(result: ReadInstanceResult): LogResult {
  const rows = [
    { label: 'Party', value: result.instanceOwnerPartyId },
    { label: 'Instance', value: result.instanceGuid },
  ];
  if (result.ok) {
    rows.push({ label: 'Data elements', value: String(result.dataElements.length) });
  }
  return {
    ok: result.ok,
    steps: result.steps,
    failedAt: result.failedAt,
    title: 'Fetched instance',
    rows,
    // Offering to open an instance that could not be read would just 404 again.
    instanceUrl: result.ok ? result.instanceUrl : null,
  };
}

function logFromDataElement(result: ReadDataElementResult): LogResult {
  return {
    ok: result.ok,
    steps: result.steps,
    failedAt: result.failedAt,
    title: 'Fetched data element',
    rows: [
      { label: 'Data guid', value: result.dataGuid },
      ...(result.contentType ? [{ label: 'Content type', value: result.contentType }] : []),
    ],
  };
}

export function App() {
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [localtest, setLocaltest] = useState<LocaltestStatus | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueApp[]>([]);
  const [exampleGroups, setExampleGroups] = useState<ExampleGroup[]>([]);
  const [bootError, setBootError] = useState<unknown>(null);

  const [tokens, setTokens] = useState<PublicToken[]>([]);
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);

  const [org, setOrg] = useLocalStorage('org', '');
  const [app, setApp] = useLocalStorage('app', '');
  const [instanceOwnerPartyId, setInstanceOwnerPartyId] = useLocalStorage('partyId', '');
  const [instanceGuid, setInstanceGuid] = useLocalStorage('instanceGuid', '');
  const [mode, setMode] = useLocalStorage<RunMode>('mode', 'sequential');
  const [dataElements, setDataElements] = useLocalStorage<DataElementInput[]>('dataElements', [
    EMPTY_ELEMENT,
  ]);
  const [validate, setValidate] = useLocalStorage('validate', true);
  const [advanceProcess, setAdvanceProcess] = useLocalStorage('advanceProcess', false);
  const [savedApps, setSavedApps] = useLocalStorage<SavedApp[]>('savedApps', []);

  const [metadata, setMetadata] = useState<AppMetadataResponse | null>(null);
  const [parties, setParties] = useState<AppParty[]>([]);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<unknown>(null);

  // One log for whichever request ran last, posting or reading.
  const [log, setLog] = useState<LogResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<unknown>(null);

  const [instanceDataElements, setInstanceDataElements] = useState<DataElementSummary[]>([]);
  const [dataGuid, setDataGuid] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<unknown>(null);

  // Ticks once a second so token expiry counts down live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshTokens = useCallback(async () => {
    try {
      const list = await api.listTokens();
      setTokens(list);
      // Keep the selection valid across server restarts and expiry pruning.
      setActiveTokenId((current) =>
        current && list.some((token) => token.id === current) ? current : (list[0]?.id ?? null),
      );
    } catch (error) {
      setBootError(error);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [config, cat, examples] = await Promise.all([
          api.getConfig(),
          api.getCatalogue(),
          api.getExamples(),
        ]);
        setServerConfig(config);
        setCatalogue(cat);
        setExampleGroups(examples.groups);
      } catch (error) {
        setBootError(error);
      }
      try {
        setLocaltest(await api.getLocaltestStatus());
      } catch {
        /* the status dot stays grey */
      }
    })();
    void refreshTokens();
  }, [refreshTokens]);

  const activeToken = useMemo(
    () => tokens.find((token) => token.id === activeTokenId) ?? null,
    [tokens, activeTokenId],
  );

  const tokenUsable = Boolean(activeToken) && !isExpired(activeToken?.expiresAt ?? null, now);
  const dataTypes = metadata?.metadata.dataTypes ?? [];

  const catalogueEntry = useMemo(
    () => catalogue.find((entry) => entry.org === org && entry.app === app) ?? null,
    [catalogue, org, app],
  );

  /**
   * What to offer in the data-type field before the app has been probed: the catalogue's view of
   * this app if we know it, otherwise every data type we have example files for.
   */
  const suggestedDataTypes = useMemo(() => {
    if (catalogueEntry) {
      return [
        catalogueEntry.dataType,
        ...catalogueEntry.subForms.map((subform) => subform.dataType),
      ];
    }
    return exampleGroups.map((group) => group.dataType);
  }, [catalogueEntry, exampleGroups]);

  // Prefill the instance owner from the token's own party claim, which for a LocalTest user is
  // almost always the party you want.
  useEffect(() => {
    if (activeToken?.partyId && !instanceOwnerPartyId) {
      setInstanceOwnerPartyId(activeToken.partyId);
    }
  }, [activeToken, instanceOwnerPartyId, setInstanceOwnerPartyId]);

  // A probe result belongs to one org and app, so drop it when the target moves.
  useEffect(() => {
    setMetadata(null);
    setParties([]);
    setProbeError(null);
  }, [org, app]);

  const rememberApp = useCallback(
    (target: SavedApp) => {
      const exists = savedApps.some(
        (saved) => saved.org === target.org && saved.app === target.app,
      );
      if (!exists) setSavedApps([target, ...savedApps].slice(0, 24));
    },
    [savedApps, setSavedApps],
  );

  async function probe() {
    if (!activeTokenId) return;
    setProbing(true);
    setProbeError(null);
    const params = { tokenId: activeTokenId, org, app };
    try {
      const meta = await api.getAppMetadata(params);
      setMetadata(meta);
      rememberApp({ org, app });
      // Parties are a bonus: not every token is allowed to list them.
      try {
        setParties(await api.getAppParties(params));
      } catch {
        setParties([]);
      }
      const types = meta.metadata.dataTypes ?? [];

      // Preselect the app's form data type if no type has been chosen yet.
      const formType = types.find((type) => type.appLogic);
      let next = dataElements;
      if (formType && next.length === 1 && !next[0]?.dataType) {
        next = [{ ...EMPTY_ELEMENT, dataType: formType.id }];
      }

      // The app has now declared its content types, so fill in any element still without one.
      // This also covers types chosen from the catalogue before the app was probed.
      next = next.map((element) => {
        if (!element.dataType || element.contentType) return element;
        const contentType = preferredContentType(
          types.find((type) => type.id === element.dataType)?.allowedContentTypes ?? [],
        );
        return contentType ? { ...element, contentType } : element;
      });

      if (next.some((element, index) => element !== dataElements[index])) {
        setDataElements(next);
      }
    } catch (error) {
      setProbeError(error);
    } finally {
      setProbing(false);
    }
  }

  async function run() {
    if (!activeTokenId) return;
    setRunning(true);
    setRunError(null);
    setLog(null);
    try {
      const payload = await api.postRun({
        tokenId: activeTokenId,
        org,
        app,
        instanceOwnerPartyId,
        mode,
        ...(mode === 'existing' ? { instanceGuid } : {}),
        dataElements: dataElements.map((element) => ({
          dataType: element.dataType,
          content: element.content,
          ...(element.contentType ? { contentType: element.contentType } : {}),
        })),
        validate,
        advanceProcess,
      });
      setLog(logFromRun(payload));
      rememberApp({ org, app });
      // Chain naturally into "now post more data to that instance".
      if (payload.instanceGuid) setInstanceGuid(payload.instanceGuid);
    } catch (error) {
      setRunError(error);
    } finally {
      setRunning(false);
    }
  }

  async function getInstance() {
    if (!activeTokenId) return;
    setFetching(true);
    setFetchError(null);
    try {
      const read = await api.getInstance({
        tokenId: activeTokenId,
        org,
        app,
        instanceOwnerPartyId,
        instanceGuid,
      });
      setLog(logFromInstance(read));
      setInstanceDataElements(read.dataElements);
      // Preselect one so fetching a data element is a single click.
      if (read.dataElements.length > 0 && !read.dataElements.some((el) => el.id === dataGuid)) {
        setDataGuid(read.dataElements[0]?.id ?? '');
      }
    } catch (error) {
      setFetchError(error);
    } finally {
      setFetching(false);
    }
  }

  async function getDataElement() {
    if (!activeTokenId || !dataGuid) return;
    setFetching(true);
    setFetchError(null);
    try {
      setLog(
        logFromDataElement(
          await api.getDataElement({
            tokenId: activeTokenId,
            org,
            app,
            instanceOwnerPartyId,
            instanceGuid,
            dataGuid,
          }),
        ),
      );
    } catch (error) {
      setFetchError(error);
    } finally {
      setFetching(false);
    }
  }

  const blockers: string[] = [];
  if (!tokenUsable) blockers.push('a valid token');
  if (!org) blockers.push('an org');
  if (!app) blockers.push('an app');
  if (!instanceOwnerPartyId) blockers.push('an instance owner party id');
  if (mode === 'existing' && !instanceGuid) blockers.push('an instance guid');
  if (dataElements.some((element) => !element.dataType))
    blockers.push('a data type on every element');
  if (dataElements.some((element) => !element.content.trim()))
    blockers.push('content on every element');

  const appHost = serverConfig?.appHost ?? 'http://local.altinn.cloud:8000';

  return (
    <div className="shell">
      <header className="masthead">
        <span className="masthead__mark">Altinn API tools</span>
        <div className="masthead__meta">
          <span className="gauge" title={appHost}>
            <span className={`led ${serverConfig ? 'led--ok' : 'led--bad'}`} />
            {appHost.replace(/^https?:\/\//, '')}
          </span>
          <span className="gauge" title={localtest?.error ?? localtest?.url}>
            <span className={`led ${localtest?.reachable ? 'led--ok' : 'led--bad'}`} />
            LocalTest
          </span>
          <span className="gauge">
            <span className={`led ${tokenUsable ? 'led--ok' : 'led--bad'}`} />
            {activeToken ? activeToken.label : 'No token'}
          </span>
        </div>
      </header>

      <div className="deck">
        <div className="column column--rail">
          {bootError ? <ErrorNotice error={bootError} /> : null}
          <TokenPanel
            serverConfig={serverConfig}
            localtest={localtest}
            tokens={tokens}
            activeToken={activeToken}
            onActivate={setActiveTokenId}
            onTokensChanged={() => void refreshTokens()}
            now={now}
          />
        </div>

        <div className="column">
          <TargetPanel
            appHost={appHost}
            org={org}
            app={app}
            onOrgChange={setOrg}
            onAppChange={setApp}
            instanceOwnerPartyId={instanceOwnerPartyId}
            onPartyChange={setInstanceOwnerPartyId}
            instanceGuid={instanceGuid}
            onInstanceGuidChange={(value) => {
              const { partyId, guid } = splitPastedInstanceId(value);
              setInstanceGuid(guid);
              if (partyId) setInstanceOwnerPartyId(partyId);
            }}
            mode={mode}
            onModeChange={setMode}
            catalogue={catalogue}
            onPickCatalogueApp={(entry) => {
              setOrg(entry.org);
              setApp(entry.app);
              // Point the first element at this app's form data type unless the operator has
              // already put something there.
              if (dataElements.length === 1 && !dataElements[0]?.content.trim()) {
                setDataElements([{ dataType: entry.dataType, content: '' }]);
              }
            }}
            savedApps={savedApps}
            onPickSavedApp={(saved) => {
              setOrg(saved.org);
              setApp(saved.app);
            }}
            onForgetSavedApp={(target) =>
              setSavedApps(
                savedApps.filter(
                  (saved) => !(saved.org === target.org && saved.app === target.app),
                ),
              )
            }
            metadata={metadata}
            parties={parties}
            onProbe={() => void probe()}
            probing={probing}
            probeError={probeError}
            hasToken={tokenUsable}
            elementCount={dataElements.length}
          />

          <PayloadPanel
            dataElements={dataElements}
            onChange={setDataElements}
            dataTypes={dataTypes}
            suggestedDataTypes={suggestedDataTypes}
            exampleGroups={exampleGroups}
            validate={validate}
            onValidateChange={setValidate}
            advanceProcess={advanceProcess}
            onAdvanceProcessChange={setAdvanceProcess}
          />

          <section className="panel">
            {blockers.length > 0 && (
              <div className="notice notice--warn" style={{ marginBottom: 12 }}>
                Needs {blockers.join(', ')}.
              </div>
            )}
            {runError ? (
              <div style={{ marginBottom: 12 }}>
                <ErrorNotice error={runError} />
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn--primary btn--fire"
              onClick={() => void run()}
              disabled={running || blockers.length > 0}
            >
              {running && <span className="btn__spinner" />}
              {running
                ? 'Posting…'
                : mode === 'existing'
                  ? 'Post data to instance'
                  : `Post to ${org || 'org'}/${app || 'app'}`}
            </button>
          </section>

          <FetchPanel
            appHost={appHost}
            org={org}
            app={app}
            instanceOwnerPartyId={instanceOwnerPartyId}
            onPartyChange={setInstanceOwnerPartyId}
            instanceGuid={instanceGuid}
            onInstanceGuidChange={(value) => {
              const { partyId, guid } = splitPastedInstanceId(value);
              setInstanceGuid(guid);
              if (partyId) setInstanceOwnerPartyId(partyId);
            }}
            dataElements={instanceDataElements}
            dataGuid={dataGuid}
            onDataGuidChange={setDataGuid}
            onGetInstance={() => void getInstance()}
            onGetDataElement={() => void getDataElement()}
            busy={fetching}
            hasToken={tokenUsable}
            error={fetchError}
          />
        </div>

        <div className="column column--log">
          <RunLog result={log} running={running || fetching} />
        </div>
      </div>
    </div>
  );
}
