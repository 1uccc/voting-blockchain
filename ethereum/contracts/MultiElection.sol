// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MultiElection {
    enum Phase {
        Setup,
        Voting,
        Closed
    }

    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
        bool exists;
    }

    struct Election {
        bool exists;
        string title;
        Phase phase;
        uint256 candidateCount;
        mapping(uint256 => Candidate) candidates;
        mapping(address => bool) hasVoted;
    }

    address public electionAdmin;
    mapping(bytes32 => Election) private elections;

    event ElectionCreated(bytes32 indexed electionKey, string title);
    event CandidateAdded(bytes32 indexed electionKey, uint256 candidateId, string name, string party);
    event VotingStarted(bytes32 indexed electionKey);
    event VotingClosed(bytes32 indexed electionKey);
    event Voted(bytes32 indexed electionKey, address indexed voter, uint256 candidateId);

    modifier onlyAdmin() {
        require(msg.sender == electionAdmin, "Only admin");
        _;
    }

    modifier electionExists(bytes32 electionKey) {
        require(elections[electionKey].exists, "Election not found");
        _;
    }

    constructor() {
        electionAdmin = msg.sender;
    }

    function createElection(bytes32 electionKey, string memory title) external onlyAdmin {
        require(electionKey != bytes32(0), "Bad key");
        require(!elections[electionKey].exists, "Election exists");
        Election storage e = elections[electionKey];
        e.exists = true;
        e.title = title;
        e.phase = Phase.Setup;
        emit ElectionCreated(electionKey, title);
    }

    function addCandidate(bytes32 electionKey, string memory name, string memory party)
        external
        onlyAdmin
        electionExists(electionKey)
    {
        Election storage e = elections[electionKey];
        require(e.phase == Phase.Setup, "Not setup phase");
        e.candidateCount++;
        e.candidates[e.candidateCount] = Candidate(e.candidateCount, name, party, 0, true);
        emit CandidateAdded(electionKey, e.candidateCount, name, party);
    }

    function startVoting(bytes32 electionKey) external onlyAdmin electionExists(electionKey) {
        Election storage e = elections[electionKey];
        require(e.phase == Phase.Setup, "Wrong phase");
        require(e.candidateCount > 0, "No candidates");
        e.phase = Phase.Voting;
        emit VotingStarted(electionKey);
    }

    function closeVoting(bytes32 electionKey) external onlyAdmin electionExists(electionKey) {
        Election storage e = elections[electionKey];
        require(e.phase == Phase.Voting, "Not voting");
        e.phase = Phase.Closed;
        emit VotingClosed(electionKey);
    }

    function vote(bytes32 electionKey, uint256 candidateId) external electionExists(electionKey) {
        Election storage e = elections[electionKey];
        require(e.phase == Phase.Voting, "Voting not open");
        require(!e.hasVoted[msg.sender], "Already voted");
        require(e.candidates[candidateId].exists, "Bad candidate");
        e.hasVoted[msg.sender] = true;
        e.candidates[candidateId].voteCount += 1;
        emit Voted(electionKey, msg.sender, candidateId);
    }

    function getElection(bytes32 electionKey)
        external
        view
        returns (bool exists, string memory title, uint8 phase, uint256 candidateCount)
    {
        Election storage e = elections[electionKey];
        return (e.exists, e.title, uint8(e.phase), e.candidateCount);
    }

    function phaseOf(bytes32 electionKey) external view electionExists(electionKey) returns (uint8) {
        return uint8(elections[electionKey].phase);
    }

    function candidateCountOf(bytes32 electionKey) external view electionExists(electionKey) returns (uint256) {
        return elections[electionKey].candidateCount;
    }

    function hasVotedIn(bytes32 electionKey, address voter) external view electionExists(electionKey) returns (bool) {
        return elections[electionKey].hasVoted[voter];
    }

    function getCandidate(bytes32 electionKey, uint256 candidateId)
        external
        view
        electionExists(electionKey)
        returns (uint256 id, string memory name, string memory party, uint256 voteCount, bool exists)
    {
        Candidate storage c = elections[electionKey].candidates[candidateId];
        return (c.id, c.name, c.party, c.voteCount, c.exists);
    }
}
