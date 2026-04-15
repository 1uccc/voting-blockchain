import { useRouter } from "next/router";
import ElectionCard, { Election } from "./ElectionCard";
import { toast } from "react-hot-toast";

interface Props {
  elections: Election[];
  onchainStatusByElection: Record<string, { exists: boolean; phase: number; isVotingOpen: boolean }>;
}

const Elections: React.FC<Props> = ({ elections, onchainStatusByElection }) => {
  const router = useRouter();

  const navigateToElectionDetails = (election: Election) => {
    const st = onchainStatusByElection[election?._id || ""];
    if (election?.status === "complete" || st?.phase === 2) {
      router.push(`/candidates?electionId=${encodeURIComponent(election?._id)}`);
      return;
    }
    const isOpen = !!st?.isVotingOpen;
    if (!isOpen) {
      toast("Admin chưa Start voting. Hiện chưa thể vào để bỏ phiếu.", {
        style: { background: "#222", color: "#fff" },
      });
      return;
    }
    router.push(`/elections/${election?._id}`);
  };

  const active = elections?.filter((e) => e?.status === "incomplete" || e?.status === "active");
  const completed = elections?.filter((e) => e?.status === "complete");

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Các cuộc bầu cử của bạn</h2>
          <p className="text-sm text-muted mt-1">Những cuộc bầu cử bạn được đăng ký tham gia</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full">
          <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
          <span className="text-xs font-medium text-success">{active.length} đang mở</span>
        </div>
      </div>

      {/* Active elections */}
      {active.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {active.map((election) => (
            <ElectionCard
              key={election?._id}
              election={election}
              votingOpen={!!onchainStatusByElection[election?._id || ""]?.isVotingOpen}
              onchainPhase={onchainStatusByElection[election?._id || ""]?.phase}
              onClick={() => navigateToElectionDetails(election)}
            />
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-3xl">
            🗳️
          </div>
          <div>
            <p className="font-display font-semibold text-white text-lg">Không có cuộc bầu cử đang mở</p>
            <p className="text-sm text-muted mt-1">Hiện tại bạn không có cuộc bầu cử nào để bỏ phiếu.</p>
          </div>
        </div>
      )}

      {/* Completed elections */}
      {completed.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider">Đã hoàn tất</h3>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 opacity-70">
            {completed.map((election) => (
              <ElectionCard
                key={election?._id}
                election={election}
                votingOpen={!!onchainStatusByElection[election?._id || ""]?.isVotingOpen}
                onchainPhase={onchainStatusByElection[election?._id || ""]?.phase}
                onClick={() => navigateToElectionDetails(election)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Elections;
