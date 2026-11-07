// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {X402Fixture} from "./X402Fixture.sol";
import {IX402Settler} from "../../src/interfaces/IX402Settler.sol";
import {X402Settler} from "../../src/X402Settler.sol";
import {IERC3009} from "../../src/interfaces/IERC3009.sol";

abstract contract SettlerFixture is X402Fixture {
    X402Settler internal settler;
    function setUp() public virtual override { super.setUp(); settler = X402Settler(d.settler); }
    function _signature(address asset, IX402Settler.Authorization memory a) internal view returns (bytes memory) {
        return _sig(MAKER_KEY, keccak256(abi.encodePacked(hex"1901", IERC3009(asset).DOMAIN_SEPARATOR(), keccak256(abi.encode(
            IERC3009(asset).TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce)))));
    }
    function _buyAuth(uint256 qty, uint256 value, bytes32 salt) internal view returns (IX402Settler.Authorization memory) {
        return IX402Settler.Authorization(maker, d.settler, value, 0, c.cutoff,
            settler.buyNonce(night, qty, c.cutoff - 1, salt));
    }
    function _sellAuth(uint256 qty, uint256 minimum, bytes32 salt) internal view returns (IX402Settler.Authorization memory) {
        return IX402Settler.Authorization(maker, d.settler, qty, 0, c.cutoff,
            settler.sellNonce(night, minimum, c.cutoff - 1, salt));
    }
    function _settleBuy(IX402Settler.Authorization memory a, uint256 qty, bytes32 salt) internal returns (uint256) {
        return settler.buy(a, _signature(USDC, a), night, qty, new Ask[](0), new Hint[](0), c.cutoff - 1, salt);
    }
    function _settleSell(IX402Settler.Authorization memory a, uint256 minimum, bytes32 salt) internal returns (uint256) {
        return settler.sell(a, _signature(address(token), a), night, minimum, new Hint[](0), c.cutoff - 1, salt);
    }
    function _quote(uint256 qty) internal returns (uint256 paid) {
        uint256 snapshot = vm.snapshotState(); paid = _buy(maker, qty); assertTrue(vm.revertToStateAndDelete(snapshot));
    }
    function _frontRun(IX402Settler.Authorization memory a) internal {
        cash.transferWithAuthorization(a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, _signature(USDC, a));
    }
}
