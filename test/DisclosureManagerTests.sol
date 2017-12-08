pragma solidity ^0.4.12;

import "truffle/Assert.sol";           // this library is huge and pushes a contract that chokes testnets (had to remove some funcs from this file for it to work)
import "truffle/DeployedAddresses.sol";    // only needed with testrpc?
import "../contracts/DisclosureManager.sol";

// Idea:  Call DisclosureManager#newEntry to push a record, call DisclosureManager#pullEntry to pull it.  Verify the two.
contract DisclosureManagerTests {

  // Call the contract constructor here so that both testPush() and testPull() use the instance
  DisclosureManager con = new DisclosureManager();

  // testPush pushes different data sets and makes sure the calls complete successfully
  function testPush01() public payable {
    // Several ways we could do this...
    // con.newEntry.call("NRCC", "BITACCESS INC.", "Canada", "Ottawa, Ontario", "2014-10-01", "$100,000.00", "Contribution", "To support a firm in the (NAICS: ) with a research and development project", "None", "GC-2014-Q3-25778", "http://open.canada.ca/search/grants/reference/1c92aea3f2f7e85f028a9a81e20fdd28", "None").then(function(result) {    // just check if it passes
    //  assert.equal(result.valueOf(), true, "result was not true");
    // });   //  }).then(done).catch(done);

    // Assert: equal isTrue isFalse isAtLeast etc...
    Assert.isAtLeast(con.newEntry("NRCC", "BITACCESS INC.", "Ottawa, Ontario", "$100,000.00", "C", "2014-10-01", "this is the purpose field", "this is the comment field"), 1, "rowNumber returned was not at least 1");
    // Assert.isAtLeast(con.newEntry(dataAddress, "NRCC", "BITACCESS INC.", "Canada", "Ottawa, Ontario"), 0, "rowNumber was not at least zero");
    
    //con.newEntry(dataAddress, "NRCC", "BITACCESS INC.", "Canada", "Ottawa, Ontario", "2014-10-01", "$100,000.00", "Contribution", "GC-2014-Q3-25778", "http://open.canada.ca/");
  }

  function testCount01() public  {
    uint count = 0;
    count = con.getListCount();
    Assert.equal(count, 1, "result was not 1");
  }

  // testPull fetches Entry data back and then compares
  function testPull01() public payable {
    // Pull what was pushed and Verify
    bytes32 organization;
    bytes32 recipient;
    bytes32 location;
    bytes16 amount;
    bytes1 fundingType;
    bytes16 date;
    bytes32 purpose;
    bytes32 comment;

    (organization, recipient, location, amount, fundingType, date, purpose, comment) = con.pullEntry(1);   // pull first real entry - official data doesn't start until row 1

    // Check to make sure pullEntry returns true for now
    Assert.equal(organization, "NRCC", "result was not correct");
    Assert.equal(recipient, "BITACCESS INC.", "result was not correct");
    Assert.equal(location, "Ottawa, Ontario", "result was not correct");
    Assert.equal(fundingType, "C", "result was not correct");
    // can add more but still counts as one test
  }

  function testPush02() public payable {
    Assert.isAtLeast(con.newEntry("NRCC", "REAL COMPANY NAME", "Montreal, Quebec", "$59,000.00", "C", "2016-Q3", "purpose here", "this is another comment."), 1, "rowNumber returned was not at least 1");
  }

  function testCount02() public {
    uint count = 0;
    count = con.getListCount();
    Assert.equal(count, 2, "result was not 2");
  }

  // testPull fetches Entry data back and then compares
  function testPull02() public payable {
    // Pull what was pushed and Verify
    bytes32 organization;
    bytes32 recipient;
    bytes32 location;
    bytes16 amount;
    bytes1 fundingType;
    bytes16 date;
    bytes32 purpose;
    bytes32 comment;

    (organization, recipient, location, amount, fundingType, date, purpose, comment) = con.pullEntry(2);

    // Check to make sure pullEntry returns true for now
    Assert.equal(organization, "NRCC", "result was not correct");
    Assert.equal(recipient, "REAL COMPANY NAME", "result was not correct");
    Assert.equal(location, "Montreal, Quebec", "result was not correct");
    // can add more but still counts as one test
  }

  // Test amendEntry
  function testAmend03() public payable {
    Assert.isAtLeast(con.amendEntry(1, "NRCC/CRNC", "BITACCESS INC", "Ottawa, Ontario", "$58,000.00", "C", "2016-Q3", "purpose here", "this is another comment."), 1, "rowNumber returned was not at least 1");
  }

  function testCount03() public {    // Amend will still add to count
    uint count = con.getListCount();
    Assert.equal(count, 3, "result was not 3");
  }

  // testPull fetches Entry data back and then compares
  function testPull03() public payable {
    // Pull what was pushed and Verify
    bytes32 organization;
    bytes32 recipient;
    bytes32 location;
    bytes16 amount;
    bytes1 fundingType;
    bytes16 date;
    bytes32 purpose;
    bytes32 comment;

    (organization, recipient, location, amount, fundingType, date, purpose, comment) = con.pullEntry(1);   // pull row number 1, which should now return amended Entry

    // Check to make sure pullEntry returns true for now
    Assert.equal(organization, "NRCC/CRNC", "result was not correct");
    Assert.equal(recipient, "BITACCESS INC", "result was not correct");
    Assert.equal(location, "Ottawa, Ontario", "result was not correct");
    // can add more but still counts as one test
  }

  function testAmend04() public payable {
    // Must amend the last valid entry (that hasn't been amended before)
    Assert.isAtLeast(con.amendEntry(3, "NRCC/CRNC", "BITACCESS INC", "Ottawa, Ontario", "$56,000.00", "C", "2016-Q3", "purpose here", "this is another comment."), 1, "rowNumber returned was not at least 1"); 
  }

  function testCount04() public {    // Amend will still add to count
    uint count = con.getListCount();
    Assert.equal(count, 4, "result was not 4");
  }

  // testPull fetches Entry data back and then compares
  function testPull04() public payable {
    // Pull what was pushed and Verify
    bytes32 organization;
    bytes32 recipient;
    bytes32 location;
    bytes16 amount;
    bytes1 fundingType;
    bytes16 date;
    bytes32 purpose;
    bytes32 comment;

    (organization, recipient, location, amount, fundingType, date, purpose, comment) = con.pullEntry(1);   // pull row number 0, which should return amended Entry two links down

    // Check to make sure pullEntry returns true for now
    Assert.equal(organization, "NRCC/CRNC", "result was not correct");
    Assert.equal(recipient, "BITACCESS INC", "result was not correct");
    Assert.equal(location, "Ottawa, Ontario", "result was not correct");
    // can add more but still counts as one test
  }

  // try a pullRow() instead
  function testPullRow04() public payable {
    // Pull what was pushed and Verify
    bytes32 organization;
    bytes32 recipient;
    bytes32 location;
    bytes16 blah16;
    bytes1 fundingType;
    bytes32 blah32;
    uint amended;

    (organization, recipient, location, blah16, fundingType, blah16, blah32, blah32, amended) = con.pullRow(1);   // pull row number 1, which should return an amended Entry

    // Check to make sure pullEntry returns true for now
    Assert.equal(organization, "NRCC", "result was not correct");
    Assert.equal(recipient, "BITACCESS INC.", "result was not correct");
    Assert.equal(location, "Ottawa, Ontario", "result was not correct");
    Assert.equal(fundingType, "C", "result was not correct");
    Assert.equal(amended, 3, "amended should point to 3rd record");
    // can add more but still counts as one test
  }

  // try a pullRow() on non-amended entry
  function testPullRow05() public payable {
    // Pull what was pushed and Verify
    bytes32 organization;
    bytes32 recipient;
    bytes32 location;
    bytes16 blah16;
    bytes1 fundingType;
    bytes32 blah32;
    uint amended;

    (organization, recipient, location, blah16, fundingType, blah16, blah32, blah32, amended) = con.pullRow(4);   // pull row number 4, which should return a non-amended Entry

    // Check to make sure pullEntry returns true for now
    Assert.equal(organization, "NRCC/CRNC", "result was not correct");
    Assert.equal(recipient, "BITACCESS INC", "result was not correct");
    Assert.equal(location, "Ottawa, Ontario", "result was not correct");
    Assert.equal(amended, 0, "result was not correct");
  }

  function testThrow00() public {
    // amendEntry should fail/revert because the record has already been amended:
    // Call function in raw form so that when it throws it doesn't break this test contract
    //bool result = con.call(bytes4(bytes32(sha3("getListCount()"))));
    bool result = con.call(bytes4(bytes32(keccak256("amendEntry(1, 'NRCC/CRNC', 'BITACCESS INC', 'Ottawa, Ontario', '$57,000.00', 'C', '2016-Q3', 'purpose here', 'this should fail')"))));

    Assert.isFalse(result, "result should be false");
  }

}
