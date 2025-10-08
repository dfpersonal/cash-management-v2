/**
 * Money and Percentage utility tests
 */

import { Money, Percentage } from '../money';

describe('Money', () => {
  describe('construction', () => {
    it('should create Money from number', () => {
      const money = new Money(100.50);
      expect(money.amount).toBe(100.50);
      expect(money.currency).toBe('GBP');
    });

    it('should create Money from string', () => {
      const money = new Money('100.50');
      expect(money.amount).toBe(100.50);
    });

    it('should handle large numbers correctly', () => {
      const money = new Money(2000000); // £2M like NS&I limit
      expect(money.amount).toBe(2000000);
      expect(money.toString()).toBe('£2000000.00');
    });
  });

  describe('arithmetic operations', () => {
    const money1 = new Money(100);
    const money2 = new Money(50);

    it('should add correctly', () => {
      const result = money1.add(money2);
      expect(result.amount).toBe(150);
    });

    it('should subtract correctly', () => {
      const result = money1.subtract(money2);
      expect(result.amount).toBe(50);
    });

    it('should multiply correctly', () => {
      const result = money1.multiply(2);
      expect(result.amount).toBe(200);
    });

    it('should divide correctly', () => {
      const result = money1.divide(2);
      expect(result.amount).toBe(50);
    });
  });

  describe('comparison operations', () => {
    const money1 = new Money(100);
    const money2 = new Money(50);
    const money3 = new Money(100);

    it('should compare equality correctly', () => {
      expect(money1.equals(money3)).toBe(true);
      expect(money1.equals(money2)).toBe(false);
    });

    it('should compare greater than correctly', () => {
      expect(money1.greaterThan(money2)).toBe(true);
      expect(money2.greaterThan(money1)).toBe(false);
      expect(money1.greaterThan(money3)).toBe(false);
    });

    it('should compare less than correctly', () => {
      expect(money2.lessThan(money1)).toBe(true);
      expect(money1.lessThan(money2)).toBe(false);
      expect(money1.lessThan(money3)).toBe(false);
    });
  });

  describe('static methods', () => {
    it('should create zero money', () => {
      const zero = Money.zero();
      expect(zero.amount).toBe(0);
    });

    it('should find maximum', () => {
      const amounts = [new Money(100), new Money(300), new Money(200)];
      const max = Money.max(...amounts);
      expect(max.amount).toBe(300);
    });

    it('should find minimum', () => {
      const amounts = [new Money(100), new Money(300), new Money(200)];
      const min = Money.min(...amounts);
      expect(min.amount).toBe(100);
    });

    it('should sum amounts', () => {
      const amounts = [new Money(100), new Money(200), new Money(300)];
      const sum = Money.sum(...amounts);
      expect(sum.amount).toBe(600);
    });
  });

  describe('formatting', () => {
    it('should format as string with currency symbol', () => {
      const money = new Money(1234.56);
      expect(money.toString()).toBe('£1234.56');
    });

    it('should handle zero formatting', () => {
      const zero = Money.zero();
      expect(zero.toString()).toBe('£0.00');
    });
  });

  describe('FSCS-specific amounts', () => {
    it('should handle standard FSCS limit', () => {
      const fscsLimit = new Money(85000);
      expect(fscsLimit.amount).toBe(85000);
      expect(fscsLimit.toString()).toBe('£85000.00');
    });

    it('should handle joint account limits', () => {
      const jointLimit = new Money(170000); // 2 × £85,000
      expect(jointLimit.amount).toBe(170000);
    });

    it('should handle NS&I limit', () => {
      const nsiLimit = new Money(2000000);
      expect(nsiLimit.amount).toBe(2000000);
    });
  });
});

describe('Percentage', () => {
  describe('construction', () => {
    it('should create Percentage from number', () => {
      const pct = new Percentage(25.5);
      expect(pct.value).toBe(25.5);
    });

    it('should create Percentage from string', () => {
      const pct = new Percentage('25.5');
      expect(pct.value).toBe(25.5);
    });

    it('should reject values outside 0-100 range', () => {
      expect(() => new Percentage(-1)).toThrow();
      expect(() => new Percentage(101)).toThrow();
    });
  });

  describe('conversion methods', () => {
    const pct = new Percentage(25);

    it('should convert to decimal', () => {
      expect(pct.toDecimal()).toBe(0.25);
    });

    it('should format as string', () => {
      expect(pct.toString()).toBe('25.00%');
    });
  });

  describe('arithmetic operations', () => {
    const pct1 = new Percentage(25);
    const pct2 = new Percentage(15);

    it('should add correctly', () => {
      const result = pct1.add(pct2);
      expect(result.value).toBe(40);
    });

    it('should subtract correctly', () => {
      const result = pct1.subtract(pct2);
      expect(result.value).toBe(10);
    });

    it('should multiply correctly', () => {
      const result = pct1.multiply(2);
      expect(result.value).toBe(50);
    });
  });

  describe('comparison operations', () => {
    const pct1 = new Percentage(25);
    const pct2 = new Percentage(15);
    const pct3 = new Percentage(25);

    it('should compare equality correctly', () => {
      expect(pct1.equals(pct3)).toBe(true);
      expect(pct1.equals(pct2)).toBe(false);
    });

    it('should compare greater than correctly', () => {
      expect(pct1.greaterThan(pct2)).toBe(true);
      expect(pct2.greaterThan(pct1)).toBe(false);
    });
  });

  describe('static factory methods', () => {
    it('should create zero percentage', () => {
      const zero = Percentage.zero();
      expect(zero.value).toBe(0);
    });

    it('should create from decimal', () => {
      const pct = Percentage.fromDecimal(0.25);
      expect(pct.value).toBe(25);
    });

    it('should create from basis points', () => {
      const pct = Percentage.fromBasisPoints(250); // 2.5%
      expect(pct.value).toBe(2.5);
    });
  });

  describe('rate-specific values', () => {
    it('should handle typical savings rates', () => {
      const rate = new Percentage(4.5);
      expect(rate.value).toBe(4.5);
      expect(rate.toDecimal()).toBe(0.045);
      expect(rate.toString()).toBe('4.50%');
    });

    it('should handle rate improvements', () => {
      const improvement = new Percentage(0.2); // 0.2% improvement
      expect(improvement.value).toBe(0.2);
      expect(improvement.toString()).toBe('0.20%');
    });
  });
});