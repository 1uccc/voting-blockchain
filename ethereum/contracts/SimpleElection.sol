// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SimpleElection
 * @notice Bầu cử on-chain đơn giản: một giao dịch vote(candidateId), không commit–reveal.
 */
contract SimpleElection {
    enum Phase {
        Setup,
        Voting,
        Closed
    }

    address public electionAdmin;
    string public title;
    Phase public phase;

    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
        bool exists;
    }

    uint256 public candidateCount;
    mapping(uint256 => Candidate) public candidates;
    mapping(address => bool) public hasVoted;

    event ElectionCreated(string title, address admin);
    event CandidateAdded(uint256 candidateId, string name, string party);
    event VotingStarted();
    event VotingClosed();
    event Voted(address indexed voter, uint256 candidateId);

    modifier onlyAdmin() {
        require(msg.sender == electionAdmin, "Only admin");
        _;
    }

    constructor(string memory _title) {
        electionAdmin = msg.sender;
        title = _title;
        phase = Phase.Setup;
        emit ElectionCreated(_title, msg.sender);
    }

    function addCandidate(string memory _name, string memory _party) external onlyAdmin {
        require(phase == Phase.Setup, "Not setup phase");
        candidateCount++;
        candidates[candidateCount] = Candidate(candidateCount, _name, _party, 0, true);
        emit CandidateAdded(candidateCount, _name, _party);
    }

    function startVoting() external onlyAdmin {
        require(phase == Phase.Setup, "Wrong phase");
        require(candidateCount > 0, "No candidates");
        phase = Phase.Voting;
        emit VotingStarted();
    }

    function vote(uint256 _candidateId) external {
        require(phase == Phase.Voting, "Voting not open");
        require(!hasVoted[msg.sender], "Already voted");
        require(candidates[_candidateId].exists, "Bad candidate");
        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount += 1;
        emit Voted(msg.sender, _candidateId);
    }

    function closeVoting() external onlyAdmin {
        require(phase == Phase.Voting, "Not voting");
        phase = Phase.Closed;
        emit VotingClosed();
    }
}
