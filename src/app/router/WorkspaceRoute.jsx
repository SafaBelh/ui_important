import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CmdPaletteProvider } from "@/contexts/CmdPaletteContext";
import { wsAPI, wsStore } from "@/features/pipelines/api/PipelineWorkspaceApi";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { RouteLoadingFallback } from "@/shared/ui/RouteLoadingFallback";
import { logError } from "@/shared/utils/logError";
import styles from "./WorkspaceRoute.module.css";

const PipelineWorkspaceView = lazy(() => import("@/features/pipelines/pages/PipelineWorkspaceView").then((module) => ({ default: module.PipelineWorkspaceView })));

export function WorkspaceRoute() {
  const { id, step } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceMode = new URLSearchParams(location.search).get("mode") || "setup";
  const workspaceCacheKey = `anomalyiq.workspace.${id}`;
  const cachedWorkspace = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(workspaceCacheKey) || "null");
    } catch (error) {
      logError("workspaceRoute.readCache", error);
      return null;
    }
  })();

  const [wsUploadData, setWsUploadData] = useState(null);
  const [wsMappingResult, setWsMappingResult] = useState(cachedWorkspace?.mappingResult ?? null);
  const [wsSeriesResult, setWsSeriesResult] = useState(cachedWorkspace?.seriesResult ?? null);
  const [wsFinalResult, setWsFinalResult] = useState(cachedWorkspace?.finalResult ?? null);
  const wsPage = step || "mapping";

  const setWsPage = (page) => navigate(`/pipelines/${id}/${page}`);

  useEffect(() => {
    try {
      sessionStorage.setItem(workspaceCacheKey, JSON.stringify({
        mappingResult: wsMappingResult,
        seriesResult: wsSeriesResult,
        finalResult: wsFinalResult,
        updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      logError("workspaceRoute.writeCache", error);
    }
  }, [workspaceCacheKey, wsMappingResult, wsSeriesResult, wsFinalResult]);

  const resetWsState = async () => {
    wsStore.activePipelineId = id;
    await wsAPI.resetDatabase();

    try {
      sessionStorage.removeItem(workspaceCacheKey);
    } catch (error) {
      logError("workspaceRoute.clearCache", error);
    }

    setWsUploadData(null);
    setWsMappingResult(null);
    setWsSeriesResult(null);
    setWsFinalResult(null);
    navigate(`/pipelines/${id}/mapping`);
  };

  return (
    <CmdPaletteProvider onNavigate={(page) => navigate(`/${page}`)}>
      <div className={styles.workspaceRoute}>
        <ErrorBoundary resetKey={`${id}:${wsPage}`}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <PipelineWorkspaceView
              pipelineId={id}
              workspaceMode={workspaceMode}
              wsPage={wsPage}
              setWsPage={setWsPage}
              wsUploadData={wsUploadData}
              setWsUploadData={setWsUploadData}
              wsMappingResult={wsMappingResult}
              setWsMappingResult={setWsMappingResult}
              wsSeriesResult={wsSeriesResult}
              setWsSeriesResult={setWsSeriesResult}
              wsFinalResult={wsFinalResult}
              setWsFinalResult={setWsFinalResult}
              resetWsState={resetWsState}
              onBack={() => navigate("/pipelines")}
              inModal={false}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </CmdPaletteProvider>
  );
}
