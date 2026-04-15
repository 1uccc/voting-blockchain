// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AdvancedElection {
    address public electionAdmin;
    string public title;

    enum ElectionState {
        Draft,
        RegistrationOn,
        CommitPhase,
        RevealPhase,
        Closed,
        Finalized
    }
    ElectionState public state;

    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
        bool exists;
    }

    struct Voter {
        bool isRegistered;
        bool hasCommitted;
        bool hasRevealed;
        bytes32 commitment;
    }

    uint256 public candidateCount;
    mapping(uint256 => Candidate) public candidates;
    mapping(address => Voter) public voters;

    address[] public registeredVoters;
    uint256 public totalVotesMined;

    event ElectionCreated(string title, address admin);
    event VoterRegistered(address voter);
    event CandidateAdded(uint256 candidateId, string name, string party);
    event StateChanged(ElectionState newState);
    event VoteCommitted(address voter);
    event VoteRevealed(address voter, uint256 candidateId);
    event ElectionFinalized(uint256 totalVotes);

    modifier onlyAdmin() {
        require(msg.sender == electionAdmin, "Only admin can call this function");
        _;
    }

    modifier inState(ElectionState _state) {
        require(state == _state, "Invalid election state for this operation");
        _;
    }

    constructor(string memory _title) {
        electionAdmin = msg.sender;
        title = _title;
        state = ElectionState.Draft;
        emit ElectionCreated(_title, msg.sender);
    }

    function addCandidate(
        string memory _name,
        string memory _party
    ) public onlyAdmin inState(ElectionState.Draft) {
        candidateCount++;
        candidates[candidateCount] = Candidate(
            candidateCount,
            _name,
            _party,
            0,
            true
        );
        emit CandidateAdded(candidateCount, _name, _party);
    }

    function startRegistration()
        public
        onlyAdmin
        inState(ElectionState.Draft)
    {
        require(candidateCount > 0, "Must have at least one candidate");
        state = ElectionState.RegistrationOn;
        emit StateChanged(state);
    }

    function registerVoter(
        address _voter
    ) public onlyAdmin inState(ElectionState.RegistrationOn) {
        require(!voters[_voter].isRegistered, "Voter already registered");
        voters[_voter].isRegistered = true;
        registeredVoters.push(_voter);
        emit VoterRegistered(_voter);
    }

    function startCommitPhase()
        public
        onlyAdmin
        inState(ElectionState.RegistrationOn)
    {
        require(registeredVoters.length > 0, "No voters registered");
        state = ElectionState.CommitPhase;
        emit StateChanged(state);
    }

    function commitVote(
        bytes32 _commitment
    ) public inState(ElectionState.CommitPhase) {
        require(voters[msg.sender].isRegistered, "You are not a registered voter");
        require(
            !voters[msg.sender].hasCommitted,
            "You have already cast a commitment"
        );

        voters[msg.sender].commitment = _commitment;
        voters[msg.sender].hasCommitted = true;

        emit VoteCommitted(msg.sender);
    }

    function startRevealPhase()
        public
        onlyAdmin
        inState(ElectionState.CommitPhase)
    {
        state = ElectionState.RevealPhase;
        emit StateChanged(state);
    }

    function revealVote(
        uint256 _candidateId,
        string memory _salt
    ) public inState(ElectionState.RevealPhase) {
        require(voters[msg.sender].hasCommitted, "No vote committed");
        require(!voters[msg.sender].hasRevealed, "Vote already revealed");
        require(candidates[_candidateId].exists, "Invalid candidate");

        bytes32 verifyHash = keccak256(abi.encodePacked(_candidateId, _salt));
        require(
            verifyHash == voters[msg.sender].commitment,
            "Commitment does not match revealed data"
        );

        voters[msg.sender].hasRevealed = true;
        candidates[_candidateId].voteCount += 1;
        totalVotesMined += 1;

        emit VoteRevealed(msg.sender, _candidateId);
    }

    function closeElection() public onlyAdmin inState(ElectionState.RevealPhase) {
        state = ElectionState.Closed;
        emit StateChanged(state);
    }

    function finalizeTally() public onlyAdmin inState(ElectionState.Closed) {
        state = ElectionState.Finalized;
        emit StateChanged(state);
        emit ElectionFinalized(totalVotesMined);
    }

    function getCandidate(
        uint256 _id
    )
        public
        view
        returns (uint256 id, string memory name, string memory party, uint256 voteCount)
    {
        require(candidates[_id].exists, "Candidate does not exist");
        Candidate memory c = candidates[_id];
        return (c.id, c.name, c.party, c.voteCount);
    }

    function getAllCandidates() public view returns (Candidate[] memory) {
        Candidate[] memory array = new Candidate[](candidateCount);
        for (uint256 i = 1; i <= candidateCount; i++) {
            array[i - 1] = candidates[i];
        }
        return array;
    }

    function generateCommitmentHash(
        uint256 _candidateId,
        string memory _salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_candidateId, _salt));
    }
}

