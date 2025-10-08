/**
 * Money utility class for financial calculations with proper precision
 */

import { Decimal } from 'decimal.js';
import { Money as IMoney, Percentage as IPercentage } from '../types';

export class Money implements IMoney {
  private readonly _amount: Decimal;
  public readonly currency: 'GBP' = 'GBP';

  constructor(amount: number | string | Decimal) {
    this._amount = new Decimal(amount);
  }

  public get amount(): number {
    return this._amount.toNumber();
  }

  public toString(): string {
    return `£${this._amount.toFixed(2)}`;
  }

  public add(other: Money): Money {
    return new Money(this._amount.add(other._amount));
  }

  public subtract(other: Money): Money {
    return new Money(this._amount.sub(other._amount));
  }

  public multiply(factor: number): Money {
    return new Money(this._amount.mul(factor));
  }

  public divide(divisor: number): Money {
    return new Money(this._amount.div(divisor));
  }

  public equals(other: Money): boolean {
    return this._amount.equals(other._amount);
  }

  public greaterThan(other: Money): boolean {
    return this._amount.greaterThan(other._amount);
  }

  public lessThan(other: Money): boolean {
    return this._amount.lessThan(other._amount);
  }

  public greaterThanOrEqual(other: Money): boolean {
    return this._amount.greaterThanOrEqualTo(other._amount);
  }

  public lessThanOrEqual(other: Money): boolean {
    return this._amount.lessThanOrEqualTo(other._amount);
  }

  public abs(): Money {
    return new Money(this._amount.abs());
  }

  public toJSON(): number {
    return this.amount;
  }

  // Static factory methods
  static zero(): Money {
    return new Money(0);
  }

  static fromPounds(pounds: number): Money {
    return new Money(pounds);
  }

  static fromPence(pence: number): Money {
    return new Money(pence / 100);
  }

  static max(...amounts: Money[]): Money {
    if (amounts.length === 0) throw new Error('Cannot find max of empty array');
    return amounts.reduce((max, current) => current.greaterThan(max) ? current : max);
  }

  static min(...amounts: Money[]): Money {
    if (amounts.length === 0) throw new Error('Cannot find min of empty array');
    return amounts.reduce((min, current) => current.lessThan(min) ? current : min);
  }

  static sum(...amounts: Money[]): Money {
    return amounts.reduce((sum, current) => sum.add(current), Money.zero());
  }
}

export class Percentage implements IPercentage {
  private readonly _value: Decimal;

  constructor(value: number | string | Decimal) {
    const decimal = new Decimal(value);
    if (decimal.lessThan(0) || decimal.greaterThan(100)) {
      throw new Error(`Percentage must be between 0 and 100, got ${decimal.toString()}`);
    }
    this._value = decimal;
  }

  public get value(): number {
    return this._value.toNumber();
  }

  public toString(): string {
    return `${this._value.toFixed(2)}%`;
  }

  public toDecimal(): number {
    return this._value.div(100).toNumber();
  }

  public add(other: Percentage): Percentage {
    return new Percentage(this._value.add(other._value));
  }

  public subtract(other: Percentage): Percentage {
    return new Percentage(this._value.sub(other._value));
  }

  public multiply(factor: number): Percentage {
    return new Percentage(this._value.mul(factor));
  }

  public equals(other: Percentage): boolean {
    return this._value.equals(other._value);
  }

  public greaterThan(other: Percentage): boolean {
    return this._value.greaterThan(other._value);
  }

  public lessThan(other: Percentage): boolean {
    return this._value.lessThan(other._value);
  }

  public toJSON(): number {
    return this.value;
  }

  // Static factory methods
  static zero(): Percentage {
    return new Percentage(0);
  }

  static fromDecimal(decimal: number): Percentage {
    return new Percentage(decimal * 100);
  }

  static fromBasisPoints(basisPoints: number): Percentage {
    return new Percentage(basisPoints / 100);
  }
}