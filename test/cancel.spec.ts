import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ItemType } from "../src/constants";
import { CreateOrderInput } from "../src/types";
import { describeWithFixture } from "./utils/setup";
import { OVERRIDE_GAS_LIMIT } from "./utils/constants";

describeWithFixture("As a user I want to cancel an order", (fixture) => {
  let offerer: SignerWithAddress;
  let zone: SignerWithAddress;
  let fulfiller: SignerWithAddress;
  let standardCreateOrderInput: CreateOrderInput;
  const nftId = "1";

  before(async () => {
    [offerer, zone, fulfiller] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const { testErc721 } = fixture;

    await testErc721.mint(offerer.address, nftId);

    standardCreateOrderInput = {
      startTime: "0",
      offer: [
        {
          itemType: ItemType.ERC721,
          token: testErc721.address,
          identifier: nftId,
        },
      ],
      consideration: [
        {
          amount: parseEther("10").toString(),
          recipient: offerer.address,
        },
      ],
      // 2.5% fee
      fees: [{ recipient: zone.address, basisPoints: 250 }],
    };
  });

  it("validate then bulk cancel orders", async () => {
    const { seaport } = fixture;

    const { executeAllActions } = await seaport.createOrder(
      standardCreateOrderInput,
    );
    const executeAllActionsOnChainOrder = (
      await seaport.createOrder(standardCreateOrderInput)
    ).executeAllActions;

    const offChainOrder = await executeAllActions();
    const onChainOrder = await executeAllActionsOnChainOrder();

    // Remove signature
    onChainOrder.signature = "0x";

    const overrides = { gasLimit: OVERRIDE_GAS_LIMIT };

    const validateTx = await seaport
      .validate([onChainOrder], offerer.address, undefined, overrides)
      .transact();
    expect(validateTx.gasLimit).to.eq(OVERRIDE_GAS_LIMIT);

    const bulkCancelOrdersTx = await seaport
      .bulkCancelOrders(offerer.address, undefined, overrides)
      .transact();
    expect(bulkCancelOrdersTx.gasLimit).to.eq(OVERRIDE_GAS_LIMIT);

    const { executeAllActions: executeAllFulfillActionsOffChainOrder } =
      await seaport.fulfillOrder({
        order: offChainOrder,
        accountAddress: fulfiller.address,
      });

    const { executeAllActions: executeAllFulfillActionsOnChainOrder } =
      await seaport.fulfillOrder({
        order: onChainOrder,
        accountAddress: fulfiller.address,
      });

    await expect(executeAllFulfillActionsOffChainOrder()).to.be.reverted;
    await expect(executeAllFulfillActionsOnChainOrder()).to.be.reverted;

    expect(
      (await seaport.getCounter(offerer.address)).gt(
        offChainOrder.parameters.counter,
      ),
    ).to.be.true;
  });

  it("validate then cancel single order", async () => {
    const { seaport } = fixture;

    const { executeAllActions } = await seaport.createOrder(
      standardCreateOrderInput,
    );
    const order = await executeAllActions();

    // Remove signature
    order.signature = "0x";

    await seaport.validate([order], offerer.address).transact();
    const orderHash = seaport.getOrderHash(order.parameters);
    expect(await seaport.getOrderStatus(orderHash)).to.have.property(
      "isValidated",
      true,
    );

    const overrides = { gasLimit: OVERRIDE_GAS_LIMIT };
    const cancelOrdersTx = await seaport
      .cancelOrders([order.parameters], offerer.address, undefined, overrides)
      .transact();
    expect(await seaport.getOrderStatus(orderHash)).to.have.property(
      "isCancelled",
      true,
    );
    expect(cancelOrdersTx.gasLimit).to.eq(OVERRIDE_GAS_LIMIT);
  });
});
