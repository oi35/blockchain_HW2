# EasyBet - 去中心化彩票系统

浙江大学区块链课程项目 - 进阶去中心化彩票系统

## 项目概述

EasyBet 是一个基于以太坊的去中心化彩票系统，支持竞猜活动创建、彩票购买、彩票交易和结算功能。

### 核心功能

1. **ERC20积分系统**：用户可以领取BET Token作为彩票购买的货币
2. **ERC721彩票凭证**：每张彩票都是一个NFT
3. **创建竞猜活动**：公证人可以创建多选项的竞猜活动
4. **购买彩票**：玩家使用BET Token购买彩票
5. **链上订单簿**：玩家之间可以交易彩票（挂单、撤单、购买）
6. **结果公布与结算**：公证人公布结果，获胜者根据彩票金额与赔率获得奖金

### 技术栈

**智能合约**：
- Solidity 0.8.20
- Hardhat 开发框架
- OpenZeppelin 合约库（ERC20, ERC721）

**前端**：
- React 19 + TypeScript
- ethers.js 5.7
- MetaMask 钱包集成

## 如何运行

### 1. 启动 Ganache

首先确保安装了 Ganache（本地区块链）。

```bash
# 启动 Ganache GUI 或使用命令行
ganache-cli
```

默认配置：
- RPC Server: http://127.0.0.1:8545
- Network ID: 1337

### 2. 安装合约依赖并编译

```bash
cd contracts
npm install
npx hardhat compile
```

### 3. 部署合约到 Ganache

```bash
npx hardhat run scripts/deploy.ts --network ganache
```

部署成功后，会显示三个合约地址：
- BetToken
- EasyBet
- LotteryTicket

**重要**：复制这些地址，需要更新到前端配置中。

### 4. 更新前端合约地址

编辑 `frontend/src/App.tsx` 文件，将第10-14行的合约地址替换为部署后的实际地址：

```typescript
const CONTRACT_ADDRESSES = {
  BetToken: '0x...', // 替换为实际地址
  EasyBet: '0x...',
  LotteryTicket: '0x...'
};
```

### 5. 复制合约ABI到前端

```bash
cd ..  # 回到项目根目录
node copy-abis.js
```

### 6. 安装前端依赖

```bash
cd frontend
npm install
```

### 7. 启动前端

```bash
npm start
```

浏览器会自动打开 http://localhost:3000

### 8. 配置 MetaMask

1. 打开 MetaMask 扩展
2. 添加自定义网络：
   - Network Name: Ganache
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 1337
   - Currency Symbol: ETH

3. 导入 Ganache 账户：
   - 从 Ganache 复制私钥
   - 在 MetaMask 中导入账户

4. 连接到网站

## 功能实现分析

### 1. ERC20积分合约（BetToken.sol）

**实现功能**：
- 用户可以免费领取1000 BET Token
- 领取间隔24小时（防止滥用）
- 标准ERC20功能（transfer, approve, balanceOf等）

**关键代码**：
```solidity
function claimTokens() external {
    require(
        block.timestamp >= lastClaimTime[msg.sender] + CLAIM_COOLDOWN,
        "Claim cooldown not expired"
    );
    lastClaimTime[msg.sender] = block.timestamp;
    _mint(msg.sender, CLAIM_AMOUNT);
}
```

### 2. ERC721彩票凭证（LotteryTicket.sol）

**实现功能**：
- 每张彩票是一个NFT
- 记录彩票的活动ID、选择、价格
- 只有EasyBet合约可以铸造彩票
- 支持查询用户拥有的所有彩票

**关键代码**：
```solidity
function mintTicket(
    address to,
    uint256 activityId,
    uint256 choice,
    uint256 price,
    uint256 odds
) external onlyEasyBet returns (uint256) {
    uint256 tokenId = _tokenIdCounter;
    _tokenIdCounter++;

    _safeMint(to, tokenId);

    tokenToActivity[tokenId] = activityId;
    tokenToChoice[tokenId] = choice;
    tokenPrice[tokenId] = price;
    tokenOdds[tokenId] = odds;

    emit TicketMinted(tokenId, to, activityId, choice, price, odds);

    return tokenId;
}
```

### 3. 主合约（EasyBet.sol）

#### 3.1 创建竞猜活动

公证人可以创建竞猜活动

```solidity
function createActivity(
    string memory name,
    string[] memory choices,
    uint256[] memory odds,
    uint256 duration
) external returns (uint256) {
    require(choices.length >= 2, "At least 2 choices required");
    require(choices.length == odds.length, "Choices and odds length mismatch");
    require(duration > 0, "Duration must be positive");
    // 验证赔率有效性（每个赔率应该 >= 100，即至少1.0倍）
    for (uint256 i = 0; i < odds.length; i++) {
        require(odds[i] >= 100, "Odds must be at least 100 (1.0x)");
    }
    uint256 activityId = _activityIdCounter;
    _activityIdCounter++;
    Activity storage activity = activities[activityId];
    activity.id = activityId;
    activity.creator = msg.sender;
    activity.name = name;
    activity.choices = choices;
    activity.odds = odds;
    activity.totalPool = 0; // 初始对赌池为0
    activity.deadline = block.timestamp + duration;
    activity.settled = false;
    activity.createdAt = block.timestamp;
    emit ActivityCreated(
        activityId,
        msg.sender,
        name,
        odds,
        activity.deadline
    );
    return activityId;
}
```

#### 3.2 购买彩票

玩家使用BET Token购买彩票，获得ERC721 NFT作为凭证。

```solidity
function buyTicket(uint256 activityId, uint256 choice, uint256 amount) externareturns (uint256) {
    Activity storage activity = activities[activityId];
    require(activity.creator != address(0), "Activity does not exist");
    require(block.timestamp < activity.deadline, "Activity expired");
    require(!activity.settled, "Activity already settled");
    require(choice < activity.choices.length, "Invalid choice");
    require(amount > 0, "Amount must be positive");

    // 扣除用户的BET Token
    require(
        betToken.transferFrom(msg.sender, address(this), amount),
        "Payment failed"
    );

    // 加入对赌池
    activity.totalPool += amount;
    choiceAmounts[activityId][choice] += amount;

    // 获取当前选项的赔率并锁定到彩票上
    uint256 lockedOdds = activity.odds[choice];

    // 铸造彩票NFT（含锁定赔率）
    uint256 ticketId = lotteryTicket.mintTicket(
        msg.sender,
        activityId,
        choice,
        amount,
        lockedOdds
    );

    // 记录购买信息
    activityChoiceCount[activityId][choice]++;
    activityChoiceBuyers[activityId][choice].push(msg.sender);
    choiceTickets[activityId][choice].push(ticketId); // 记录彩票ID

    emit TicketPurchased(activityId, ticketId, msg.sender, choice, amount, lockedOdds);

    return ticketId;
}
```

#### 3.3 链上订单簿

实现了完整的订单簿系统，支持挂单、撤单、购买。

**创建订单**：
```solidity
function createOrder(uint256 ticketId, uint256 price) external returns (uint256) {
    require(price > 0, "Price must be positive");
    require(lotteryTicket.ownerOf(ticketId) == msg.sender, "Not ticket owner");
    require(!ticketInOrder[ticketId], "Ticket already in order"); // 防止重复挂单
    // 获取彩票信息
    (uint256 activityId, , , , ) = lotteryTicket.getTicketInfo(ticketId);
    Activity storage activity = activities[activityId];
    require(block.timestamp < activity.deadline, "Activity expired");
    require(!activity.settled, "Activity already settled");
    // 将彩票授权给合约（用于后续交易）
    // 注意：用户需要先调用 lotteryTicket.approve(address(this), ticketId)
    uint256 orderId = _orderIdCounter;
    _orderIdCounter++;
    orders[orderId] = Order({
        id: orderId,
        seller: msg.sender,
        ticketId: ticketId,
        price: price,
        active: true,
        createdAt: block.timestamp
    });
    activityOrders[activityId].push(orderId);
    ticketInOrder[ticketId] = true; // 标记彩票正在挂单中
    emit OrderCreated(orderId, ticketId, msg.sender, price);
    return orderId;
}

**撤回订单**：
```solidity
function cancelOrder(uint256 orderId) external {
    Order storage order = orders[orderId];
    require(order.active, "Order not active");
    require(order.seller == msg.sender, "Not order owner");
    order.active = false;
    ticketInOrder[order.ticketId] = false; // 清除挂单标记
    emit OrderCancelled(orderId);
}

**修改订单**：
```solidity
function updateOrderPrice(uint256 orderId, uint256 newPrice) external {
    Order storage order = orders[orderId];
    require(order.active, "Order not active");
    require(order.seller == msg.sender, "Not order owner");
    require(newPrice > 0, "Price must be positive");
    uint256 oldPrice = order.price;
    order.price = newPrice;
    emit OrderPriceUpdated(orderId, order.ticketId, oldPrice, newPrice);
}
```

**购买订单**：
```solidity
function fillOrder(uint256 orderId) external {
    Order storage order = orders[orderId];
    require(order.active, "Order not active");
    // 获取彩票信息
    uint256 ticketId = order.ticketId;
    (uint256 activityId, , , , ) = lotteryTicket.getTicketInfo(ticketId);
    Activity storage activity = activities[activityId];
    require(block.timestamp < activity.deadline, "Activity expired");
    require(!activity.settled, "Activity already settled");
    // 买家支付BET Token给卖家
    require(
        betToken.transferFrom(msg.sender, order.seller, order.price),
        "Payment failed"
    );
    // 转移彩票NFT
    lotteryTicket.transferFrom(order.seller, msg.sender, ticketId);
    // 标记订单为已完成
    order.active = false;
    ticketInOrder[ticketId] = false; // 清除挂单标记
    emit OrderFilled(orderId, ticketId, msg.sender, order.seller, order.price);
}
```

**获取订单簿**：
```solidity
function getOrderBook(uint256 activityId) external view returns (
    uint256[] memory orderIds,
    uint256[] memory ticketIds,
    uint256[] memory prices,
    address[] memory sellers
) {
    // 返回活动的所有有效订单
    // ...
}
```

#### 3.4 结果公布与结算

公证人公布结果后，自动将奖池平分给获胜者。

```solidity
function settleActivity(uint256 activityId, uint256 winningChoice) external {
    Activity storage activity = activities[activityId];
    require(activity.creator == msg.sender, "Only creator can settle");
    require(block.timestamp >= activity.deadline, "Activity not expired yet");
    require(!activity.settled, "Already settled");
    require(winningChoice < activity.choices.length, "Invalid winning choice");
    activity.settled = true;
    activity.winningChoice = winningChoice;
    // 获取获胜选项的所有彩票ID
    uint256[] storage winningTickets = choiceTickets[activityId][winningChoice];
    uint256 totalWinners = winningTickets.length;
    if (totalWinners == 0) {
        // 如果没有获胜者，对赌池退还给公证人
        if (activity.totalPool > 0) {
            betToken.transfer(activity.creator, activity.totalPool);
        }
        emit ActivitySettled(activityId, winningChoice, 0, 0);
        return;
    }
    // 第一轮：计算总应付奖金
    uint256 totalPayout = 0;
    for (uint256 i = 0; i < totalWinners; i++) {
        uint256 ticketId = winningTickets[i];
        (, , uint256 ticketAmount, uint256 ticketOdds, ) = lotteryTicketgetTicketInfo(ticketId);
        // 应得奖金 = 投注金额 × 赔率 / 100
        uint256 expectedPayout = (ticketAmount * ticketOdds) / 100;
        totalPayout += expectedPayout;
    }
    // 第二轮：分发奖金
    uint256 actualTotalPaid = 0;
    if (totalPayout <= activity.totalPool) {
        // 对赌池足够，全额支付
        for (uint256 i = 0; i < totalWinners; i++) {
            uint256 ticketId = winningTickets[i];
            (, , uint256 ticketAmount, uint256 ticketOdds, address owner) =lotteryTicket.getTicketInfo(ticketId);
            uint256 payout = (ticketAmount * ticketOdds) / 100;
            betToken.transfer(owner, payout);
            actualTotalPaid += payout;
        }
        // 剩余的对赌池退还给公证人
        uint256 remaining = activity.totalPool - actualTotalPaid;
        if (remaining > 0) {
            betToken.transfer(activity.creator, remaining);
        }
    } else {
        // 对赌池不足，按比例分配
        for (uint256 i = 0; i < totalWinners; i++) {
            uint256 ticketId = winningTickets[i];
            (, , uint256 ticketAmount, uint256 ticketOdds, address owner) =lotteryTicket.getTicketInfo(ticketId);
            uint256 expectedPayout = (ticketAmount * ticketOdds) / 100;
            // 实际获得 = 应得 × (对赌池 / 总应付)
            uint256 actualPayout = (expectedPayout * activity.totalPool) /totalPayout;
            betToken.transfer(owner, actualPayout);
            actualTotalPaid += actualPayout;
        }
    }
    emit ActivitySettled(activityId, winningChoice, totalWinners,actualTotalPaid / totalWinners);
}
```

### 4. 前端实现

#### 4.1 钱包连接

使用ethers.js连接MetaMask钱包：

```typescript
const connectWallet = async () => {
  if (!(window as any).ethereum) {
    alert('请安装MetaMask!');
    return;
  }

  try {
    const provider = new ethers.providers.Web3Provider((window as any).ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    // 获取网络信息
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(address);

    setProvider(provider);
    setSigner(signer);
    setAccount(address);

    // 收集调试信息
    const debug: any = {
      account: address,
      ethBalance: ethers.utils.formatEther(balance),
      chainId: network.chainId,
      networkName: network.name,
      contracts: CONTRACT_ADDRESSES,
      timestamp: new Date().toLocaleString()
    };

    // 验证合约
    try {
      const betTokenCode = await provider.getCode(CONTRACT_ADDRESSES.BetToken);
      const easyBetCode = await provider.getCode(CONTRACT_ADDRESSES.EasyBet);
      const lotteryTicketCode = await provider.getCode(CONTRACT_ADDRESSES.LotteryTicket);

      debug.contractsExist = {
        BetToken: betTokenCode !== '0x',
        EasyBet: easyBetCode !== '0x',
        LotteryTicket: lotteryTicketCode !== '0x'
      };
    } catch (err) {
      debug.contractsExist = { error: 'Unable to check' };
    }

    setDebugInfo(debug);
    console.log('🔍 调试信息:', debug);

    // 初始化合约
    const betToken = new ethers.Contract(CONTRACT_ADDRESSES.BetToken, BetTokenABI.abi, signer);
    const easyBet = new ethers.Contract(CONTRACT_ADDRESSES.EasyBet, EasyBetABI.abi, signer);
    const lotteryTicket = new ethers.Contract(CONTRACT_ADDRESSES.LotteryTicket, LotteryTicketABI.abi, signer);

    setBetTokenContract(betToken);
    setEasyBetContract(easyBet);
    setLotteryTicketContract(lotteryTicket);

    // 加载数据
    loadUserData(betToken, easyBet, lotteryTicket, address);
  } catch (error) {
    console.error('连接钱包失败:', error);
    alert('连接钱包失败: ' + (error as any).message);
  }
};
```

#### 4.2 数据加载

从区块链加载活动列表、用户彩票等数据：

```typescript
const loadUserData = async (betToken: any, easyBet: any, lotteryTicket: any,address: string) => {
  try {
    const balance = await betToken.balanceOf(address);
    setBetBalance(ethers.utils.formatEther(balance));
    const canClaimTokens = await betToken.canClaim(address);
    setCanClaim(canClaimTokens);
    const activityCount = await easyBet.getActivityCount();
    const acts = [];
    for (let i = 0; i < activityCount; i++) {
      const activity = await easyBet.getActivity(i);
      acts.push({
        id: activity.id.toNumber(),
        name: activity.name,
        creator: activity.creator,
        choices: activity.choices,
        odds: activity.odds.map((o: any) => o.toNumber()), // 赔率数组
        totalPool: ethers.utils.formatEther(activity.totalPool), // 对赌池
        deadline: new Date(activity.deadline.toNumber() * 1000),
        settled: activity.settled,
        winningChoice: activity.winningChoice.toNumber(),
      });
    }
    setActivities(acts);
    const tickets = await lotteryTicket.getTicketsByOwner(address);
    const ticketDetails = [];
    for (let tokenId of tickets) {
      const info = await lotteryTicket.getTicketInfo(tokenId);
      ticketDetails.push({
        tokenId: tokenId.toNumber(),
        activityId: info.activityId.toNumber(),
        choice: info.choice.toNumber(),
        price: ethers.utils.formatEther(info.price),
        odds: info.odds.toNumber(), // 锁定的赔率
      });
    }
    setMyTickets(ticketDetails);
  } catch (error) {
    console.error('加载数据失败:', error);
  }
};
```

#### 4.3 交易处理

所有涉及ERC20的操作都需要先approve：

```typescript
const buyTicket = async (activityId: number, choice: number) => {
  try {
    // 提示用户输入投注金额
    const amountStr = prompt('请输入投注金额（BET）:');
    if (!amountStr) return;
    const amount = ethers.utils.parseEther(amountStr);
    const approveTx = await betTokenContract.approve(CONTRACT_ADDRESSES.EasyBet,amount);
    await approveTx.wait();
    const tx = await easyBetContract.buyTicket(activityId, choice, amount);
    await tx.wait();
    alert('购买成功!');
    loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account);
  } catch (error: any) {
    console.error('购买失败:', error);
    alert('购买失败: ' + error.message);
  }
};
```

## 功能演示流程

### 1. 公证人创建活动

1. 连接MetaMask钱包
2. 填写活动信息：
   - 活动名称：例如 "NBA总冠军"
   - 选项：例如 "湖人,热火,勇士"
   - 赔率：例如 "1.1,1.5,3.5"
   - 持续时间：例如 24 小时
3. 点击"创建活动"，MetaMask会弹出两次确认（approve和create）
4. 可以点击调整赔率进行实时的调整

### 2. 玩家购买彩票

1. 在活动列表中找到想参与的活动
2. 点击对应的选项按钮（例如"湖人"）
3. MetaMask确认交易（approve + buyTicket）
4. 在"我的彩票"中查看已购买的彩票

### 3. 彩票交易

#### 卖家挂单：
1. 在"我的彩票"中找到要出售的彩票
2. 点击"挂单出售"
3. 输入出售价格（例如 15 BET）
4. 确认交易

#### 买家购买：
1. 点击活动的"查看订单簿"
2. 在订单簿中找到想购买的彩票
3. 点击"购买"按钮
4. 确认交易

### 4. 公证人结算

1. 等待活动截止时间到期
2. 在活动卡片中选择获胜选项
3. 点击"结算"按钮
4. 确认交易
5. 获胜者自动获得奖金，奖池如果有剩余则分给公证人

## 技术亮点

### 1. 完整的ERC20+ERC721集成

- 使用ERC20作为交易货币
- 使用ERC721作为彩票凭证
- 合约之间的安全交互

### 2. 链上订单簿

- 完全去中心化的订单簿
- 支持挂单、撤单、购买
- 实时查询有效订单

### 3. 公平的结算机制

- 所有购买者记录在链上
- 自动计算奖金分配
- 防止重复结算

### 4. 用户友好的界面

- 响应式设计
- 实时数据更新
- 清晰的交易反馈

## 参考资料

- OpenZeppelin合约库：https://docs.openzeppelin.com/contracts/
- Hardhat文档：https://hardhat.org/
- ethers.js文档：https://docs.ethers.io/v5/
- 课程Demo：https://github.com/LBruyne/blockchain-course-demos

## 作者

李明睿 浙江大学区块链课程 2025
